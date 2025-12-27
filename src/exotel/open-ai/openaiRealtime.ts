import WebSocket from "ws"
import { OPENAI_REALTIME_MODEL, OPENAI_API_KEY, OPENAI_PROMPT_ID, OPENAI_PROMPT_VERSION } from "../../config"

export class OpenAIRealtime {
  private ws: WebSocket
  private ready = false
  private speaking = false
  private hasAudio = false
  private activeResponseId: string | null = null

  constructor(
    private onAudio: (pcm16Base64: string) => void,
    private onUserText: (text: string) => void,
    private onAiText: (text: string) => void,
    private onBargeIn: () => void,
    private onResponseDone?: () => void,
    private onReady?: () => void,
    private onAiTextDelta?: (delta: string) => void,
    private onUserTextDelta?: (delta: string) => void,
    private onSpeechStopped?: () => void
  ) {
    this.ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
        OPENAI_REALTIME_MODEL
      )}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    )

    this.ws.on("open", () => {
      this.ready = true
      console.log("🟢 OPENAI READY")
      this.onReady?.()

      this.send({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "alloy",

          // PCM16 format at 24kHz (OpenAI's native format)
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",

          // Server VAD for speech detection + barge-in
          // create_response: true = VAD automatically commits buffer and creates response
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
          },

          input_audio_transcription: {
            model: "gpt-4o-transcribe",
          },
          prompt: {
            id: OPENAI_PROMPT_ID,
            version: OPENAI_PROMPT_VERSION,
          },
        },
      })
    })

    this.ws.on("message", (msg) => this.handle(JSON.parse(msg.toString())))
    this.ws.on("close", () => console.log("🔴 OPENAI SOCKET CLOSED"))
    this.ws.on("error", (err) => console.error("❌ OPENAI SOCKET ERROR", err))
  }

  private handle(evt: any) {
    // Barge-in: user started speaking while AI is speaking
    if (evt.type === "input_audio_buffer.speech_started" && this.speaking) {
      this.onBargeIn()
      this.cancelResponse()
      return
    }

    // User stopped speaking (VAD detected silence)
    if (evt.type === "input_audio_buffer.speech_stopped") {
      this.onSpeechStopped?.()
      return
    }

    // Track response lifecycle
    if (evt.type === "response.created") {
      this.activeResponseId = evt.response?.id ?? null
    }

    // Audio delta from AI
    if (evt.type === "response.audio.delta") {
      this.speaking = true
      this.onAudio(evt.delta)
      return
    }

    // Audio response complete
    if (evt.type === "response.audio.done") {
      this.speaking = false
      return
    }

    // Response fully complete
    if (evt.type === "response.done") {
      this.speaking = false
      this.activeResponseId = null
      this.onResponseDone?.()
      return
    }

    // User speech transcription delta (real-time)
    if (evt.type === "conversation.item.input_audio_transcription.delta") {
      evt.delta && this.onUserTextDelta?.(evt.delta)
      return
    }

    // User speech transcription complete
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      evt.transcript && this.onUserText(evt.transcript)
      return
    }

    // AI speech transcription delta (real-time)
    if (evt.type === "response.audio_transcript.delta") {
      evt.delta && this.onAiTextDelta?.(evt.delta)
      return
    }

    // AI speech transcription complete
    if (evt.type === "response.audio_transcript.done") {
      evt.transcript && this.onAiText(evt.transcript)
      return
    }

    // Error handling
    if (evt.type === "error") {
      console.error("❌ OPENAI ERROR", evt.error)
    }
  }

  sendAudio(pcm16Base64: string) {
    if (!this.ready) return
    this.hasAudio = true
    this.send({ type: "input_audio_buffer.append", audio: pcm16Base64 })
  }

  endTurn() {
    // With create_response: true, the server VAD automatically commits and creates response
    // This method is kept for manual triggering if needed (e.g., HTML client)
    if (!this.hasAudio) return
    this.send({ type: "input_audio_buffer.commit" })
    if (!this.activeResponseId) {
      this.send({ type: "response.create" })
    }
    this.hasAudio = false
  }

  cancelResponse() {
    // Only cancel if there's an active response
    if (this.activeResponseId) {
      this.send({ type: "response.cancel" })
    }
    // Clear audio buffer to stop any pending audio from being processed
    this.send({ type: "input_audio_buffer.clear" })
    this.speaking = false
    this.activeResponseId = null
    this.hasAudio = false
  }

  close() {
    this.ws.close()
  }

  private send(obj: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    }
  }
}

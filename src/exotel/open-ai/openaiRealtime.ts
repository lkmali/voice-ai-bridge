import WebSocket from "ws"
import {
  OPENAI_API_KEY,
  OPENAI_REALTIME_MODEL,
  OPENAI_PROMPT_ID,
  OPENAI_PROMPT_VERSION,
} from "../../config"

export class OpenAIRealtimeConnection {
  private ws: WebSocket
  private ready = false
  private hasAudio = false
  private audioQueue: string[] = []

  constructor(
    private onAudio: (pcmBase64: string) => void,
    private onUserText: (text: string) => void,
    private onAiText: (text: string) => void
  ) {
    this.ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    )

    this.ws.on("open", () => {
      console.log("🟢 OPENAI CONNECTED")
      this.ready = true

      this.ws.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          turn_detection: { type: "server_vad" },
          voice: "alloy",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "gpt-4o-mini-transcribe",
            language: "en",
          },
          instructions: "You are a voice assistant. Speak English only.",
          prompt: {
            id: OPENAI_PROMPT_ID,
            version: OPENAI_PROMPT_VERSION,
          },
        },
      }))

      // 🔥 FLUSH BUFFERED AUDIO
      for (const chunk of this.audioQueue) {
        this.ws.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: chunk,
        }))
      }
      this.audioQueue = []
    })

    this.ws.on("message", msg => {
      const evt = JSON.parse(msg.toString())
      this.handle(evt)
    })

    this.ws.on("error", err => {
      console.error("❌ OPENAI WS ERROR", err)
    })
  }

  private handle(evt: any) {
    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      if (evt.transcript) this.onUserText(evt.transcript)
      return
    }

    if (evt.type === "response.audio_transcript.done") {
      if (evt.transcript) this.onAiText(evt.transcript)
      return
    }

    if (evt.type === "response.audio.delta" && evt.delta) {
      this.onAudio(evt.delta)
      return
    }

    if (evt.type === "error") {
      console.error("❌ OPENAI ERROR:", evt.error)
    }
  }

  sendAudio(base64Pcm: string) {
    this.hasAudio = true

    if (!this.ready || this.ws.readyState !== WebSocket.OPEN) {
      // 🔥 BUFFER UNTIL READY
      this.audioQueue.push(base64Pcm)
      return
    }

    this.ws.send(JSON.stringify({
      type: "input_audio_buffer.append",
      audio: base64Pcm,
    }))
  }

  endAudio() {
    if (!this.hasAudio || !this.ready) return

    this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }))
    this.ws.send(JSON.stringify({
      type: "response.create",
      response: { modalities: ["audio", "text"] },
    }))

    this.hasAudio = false
  }

  close() {
    try {
      this.ws.close()
    } catch {}
  }
}

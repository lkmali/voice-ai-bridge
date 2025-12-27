// openai.realtime.ts
import WebSocket from "ws"
import {
  OPENAI_API_KEY,
  OPENAI_REALTIME_MODEL,
  OPENAI_PROMPT_ID,
  OPENAI_PROMPT_VERSION,
} from "../../config"

export class OpenAIRealtime {
  private ws!: WebSocket
  private ready = false
  private hasAudio = false

  constructor(
    private onAudio: (pcm16Base64: string) => void,
    private onUserText: (text: string) => void,
    private onAiText: (text: string) => void,
    private onBargeIn: () => void
  ) {
    this.connect()
  }

  private connect() {
    this.ws = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
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

      this.ws.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          turn_detection: { type: "server_vad", silence_duration_ms: 600 },
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          voice: "alloy",
          instructions: "You are a professional English-speaking voice assistant.",
        },
      }))
    })

    this.ws.on("message", raw => this.handle(JSON.parse(raw.toString())))
  }

  private handle(evt: any) {
    if (evt.type === "input_audio_buffer.speech_started") {
      this.onBargeIn()
    }

    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      this.onUserText(evt.transcript)
    }

    if (evt.type === "response.audio_transcript.done") {
      this.onAiText(evt.transcript)
    }

    if (evt.type === "response.audio.delta") {
      this.onAudio(evt.delta)
    }
  }

  sendAudio(pcm16Base64: string) {
    if (!this.ready) return
    this.hasAudio = true
    this.ws.send(JSON.stringify({
      type: "input_audio_buffer.append",
      audio: pcm16Base64,
    }))
  }

  endTurn() {
    if (!this.hasAudio) return
    this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }))
    this.ws.send(JSON.stringify({ type: "response.create" }))
    this.hasAudio = false
  }

  truncate() {
    this.ws.send(JSON.stringify({ type: "response.cancel" }))
  }

  close() {
    this.ws.close()
  }
}

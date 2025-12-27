import WebSocket from "ws"
import { OPENAI_API_KEY, OPENAI_REALTIME_MODEL } from "./config"
import { Memory } from "./memory"

type EventHandler = (evt: any) => void
type ReadyHandler = () => void
type ErrorHandler = (errInfo: any) => void

export class OpenAIRealtimeConnection {
  private ws: WebSocket
  private connId: string
  private hasAudio = false
  private activeResponseId: string | null = null
  private memory = new Memory()

  constructor(
    private onEvent: EventHandler,
    private onReady: ReadyHandler,
    private onError: ErrorHandler
  ) {
    this.connId = Date.now().toString(36)

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      OPENAI_REALTIME_MODEL
    )}`

    console.log(`[OPENAI CONNECT:${this.connId}]`, url)

    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    })

    this.setupListeners()
  }

  private setupListeners() {
    this.ws.on("open", () => {
      this.configureSession()
      this.onReady()
    })

    this.ws.on("error", (err) => {
      this.onError({ type: "socket_error", err })
    })

    this.ws.on("close", () => {
      this.onError({ type: "socket_closed" })
    })

    this.ws.on("message", (data) => {
      const evt = JSON.parse(data.toString())
      this.handleEvent(evt)
    })
  }

  private handleEvent(evt: any) {
    if (evt.type === "error") {
      this.onError(evt.error)
      return
    }

    // map event names for your frontend
    evt = this.mapEvent(evt)

    // track response
    if (evt.type === "response.created") {
      this.activeResponseId = evt.response?.id ?? null
    }
    if (evt.type === "response.completed") {
      this.activeResponseId = null
    }

    // store assistant final text in memory
    if (evt.type === "response.output_text.done") {
      if (evt.text) this.memory.add("assistant", evt.text)
    }

    this.onEvent(evt)
  }

  private mapEvent(evt: any) {
    switch (evt.type) {
      case "response.text.delta":
        return { ...evt, type: "response.output_text.delta" }
      case "response.text.done":
        return { ...evt, type: "response.output_text.done", text: evt.text }
      case "response.audio.delta":
        return { ...evt, type: "response.output_audio.delta" }
      case "response.audio.done":
      case "response.done":
        return { ...evt, type: "response.completed" }
      case "response.audio_transcript.delta":
        return {
          ...evt,
          type: "conversation.item.input_audio_transcription.delta",
        }
      case "response.audio_transcript.done":
        return {
          ...evt,
          type: "conversation.item.input_audio_transcription.completed",
        }
      default:
        return evt
    }
  }

  private send(obj: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    }
  }

  private configureSession() {
    this.send({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "gpt-4o-transcribe" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          silence_duration_ms: 500,
          create_response: false,
        },
        instructions:
          "You are a helpful voice AI. Respond kindly and clearly. Keep short answers.",
      },
    })
  }

  public sendAudio(audio: string) {
    this.hasAudio = true
    this.send({ type: "input_audio_buffer.append", audio })
  }

  public endAudio() {
    if (!this.hasAudio || this.activeResponseId) return

    this.send({ type: "input_audio_buffer.commit" })
    this.send({ type: "response.create" })
    this.hasAudio = false
  }

  public addUserText(text: string) {
    if (text.trim().length === 0) return
    this.memory.add("user", text)
  }

  public close() {
    this.ws.close()
  }
}

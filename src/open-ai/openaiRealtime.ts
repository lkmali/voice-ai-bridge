/* =========================
   File: src/open-ai/openaiRealtime.ts
   ========================= */
import WebSocket from "ws"
import https from "https"
import { OPENAI_API_KEY, OPENAI_REALTIME_MODEL } from "../config"
import { logger } from "../logger"

type EventHandler = (evt: any) => void
type ReadyHandler = () => void
type ErrorHandler = (errInfo: any) => void

export class OpenAIRealtimeConnection {
  private ws: WebSocket
  private connId: string
  private hasAudio = false
  private activeResponseId: string | null = null

  constructor(
    private onEvent: EventHandler,
    private onReady: ReadyHandler,
    private onError: ErrorHandler
  ) {
    this.connId = Date.now().toString(36)

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      OPENAI_REALTIME_MODEL
    )}`

    logger.info(`[OPENAI CONNECT:${this.connId}] ${url}`)

    const agent = new https.Agent({
      keepAlive: false,
      rejectUnauthorized: true,
    })

    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
      agent,
    } as any)

    this.setupListeners()
  }

  private setupListeners() {
    this.ws.on("open", () => {
      logger.info("✅ OpenAI WebSocket OPEN")
      this.configureSession()
      this.onReady()
    })

    this.ws.on("unexpected-response", (req, res) => {
      logger.error(
        "❌ OPENAI WS Unexpected Response",
        res.statusCode,
        res.headers
      )
      res.on("data", (chunk) => logger.error("Body:", chunk.toString()))
    })

    this.ws.on("error", (err) => {
      logger.error("❌ OPENAI SOCKET ERROR", err)
      this.onError({ type: "socket_error", err })
    })

    this.ws.on("close", (code, reason) => {
      logger.error("❌ OPENAI SOCKET CLOSED", {
        code,
        reason: reason?.toString(),
      })
      this.onError({ type: "socket_closed", code, reason })
    })

    this.ws.on("message", (data) => {
      let evt: any = {}
      try {
        evt = JSON.parse(data.toString())
      } catch (e) {
        // Non-JSON frames can appear (rare). We ignore them.
        logger.warn(
          "⚠️ Non-JSON frame from OpenAI",
          data.toString().slice(0, 200)
        )
        return
      }
      this.handleEvent(evt)
    })
  }

  private mapEvent(evt: any) {
    switch (evt.type) {
      case "response.text.delta":
        return { ...evt, type: "response.output_text.delta" }
      case "response.text.done":
        return { ...evt, type: "response.output_text.done", text: evt.text }
      case "response.audio.delta":
        return { ...evt, type: "response.output_audio.delta", audio: evt.audio }
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

  private handleEvent(evt: any) {
    if (evt.type === "error") {
      logger.error("❌ OpenAI EVENT ERROR:", evt.error)
      this.onError(evt.error)
      return
    }

    evt = this.mapEvent(evt)

    if (evt.type === "response.created") {
      this.activeResponseId = evt.response?.id ?? null
    }
    if (evt.type === "response.completed") {
      this.activeResponseId = null
    }

    // Forward to consumer
    this.onEvent(evt)
  }

  private send(obj: any) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  private configureSession() {
    logger.info("⚙️ Sending session.update to OpenAI...")
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

  // audio must be base64 string already
  public sendAudio(audioB64: string) {
    this.hasAudio = true
    this.send({ type: "input_audio_buffer.append", audio: audioB64 })
  }

  public endAudio() {
    if (!this.hasAudio || this.activeResponseId) return
    this.send({ type: "input_audio_buffer.commit" })
    this.send({ type: "response.create" })
    this.hasAudio = false
  }

  public close() {
    logger.info("🔌 Closing OpenAI WebSocket...")
    try {
      this.ws.close()
    } catch (e) {
      logger.error("Close error:", e)
    }
  }
}

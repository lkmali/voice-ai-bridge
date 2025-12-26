import WebSocket from "ws"
import { OPENAI_API_KEY, OPENAI_REALTIME_MODEL } from "../../config"

function ts() {
  return new Date().toISOString()
}

export class OpenAIRealtimeConnection {
  private ws: WebSocket
  private hasAudio = false

  constructor(
    private onEvent: (evt: any) => void,
    private onReady: () => void,
    private onError: (err: any) => void
  ) {
    const url = `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`

    console.log(ts(), "🌐 OPENAI CONNECT", url)

    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    })

    this.ws.on("open", () => {
      console.log(ts(), "🟢 OPENAI SOCKET OPEN")
      this.configureSession()
      this.onReady()
    })

    this.ws.on("close", () => {
      console.log(ts(), "🔴 OPENAI SOCKET CLOSED")
      this.onError({ type: "socket_closed" })
    })

    this.ws.on("error", (err) => {
      console.error(ts(), "❌ OPENAI SOCKET ERROR", err)
      this.onError(err)
    })

    this.ws.on("message", (data) => {
      const evt = JSON.parse(data.toString())
      console.log(ts(), "📥 OPENAI → SERVER", evt.type)

      // USER SPEECH
     if (evt.type === "conversation.item.input_audio_transcription.completed") {
  const text =
    evt.transcript ||
    evt.item?.content?.[0]?.text ||
    evt.item?.content?.[0]?.transcript ||
    "";

  console.log("📝 USER SAID:", text);

  if (text) {
    this.onEvent({
      type: "user_transcript",
      text
    });
  }
}

      // AI TEXT
      if (evt.type === "response.output_text.delta") {
        process.stdout.write(evt.delta)
      }

     if (evt.type === "response.output_text.done") {
  const text =
    evt.output_text ||
    evt.text ||
    evt.item?.content?.[0]?.text ||
    "";

  if (text) {
    this.onEvent({
      type: "assistant_text",
      text
    });
  }
}

      // RESPONSE LIFECYCLE
      if (evt.type === "response.created") {
        console.log(ts(), "🟢 RESPONSE CREATED")
      }

      if (evt.type === "response.completed") {
        console.log(ts(), "✅ RESPONSE COMPLETED")
      }

      this.onEvent(this.mapEvent(evt))
    })
  }

  private configureSession() {
    console.log(ts(), "⚙️ OPENAI SESSION CONFIG")

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
          create_response: true,
        },
        instructions:
          "You are a polite voice assistant. Respond briefly and clearly.",
      },
    })
  }

  sendAudio(audio: string) {
    this.hasAudio = true
    this.send({ type: "input_audio_buffer.append", audio })
  }

  endAudio() {
    if (!this.hasAudio) return
    console.log(ts(), "📤 COMMIT AUDIO TO OPENAI")
    this.send({ type: "input_audio_buffer.commit" })
    this.hasAudio = false
  }

  close() {
    try {
      this.ws.close()
    } catch {}
  }

  private send(obj: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    }
  }

  private mapEvent(evt: any) {
    switch (evt.type) {
      case "response.audio.delta":
        return { ...evt, type: "response.output_audio.delta", audio: evt.audio }
      case "response.text.delta":
        return { ...evt, type: "response.output_text.delta" }
      case "response.text.done":
        return { ...evt, type: "response.output_text.done", text: evt.text }
      case "response.done":
        return { ...evt, type: "response.completed" }
      default:
        return evt
    }
  }
}

import WebSocket from "ws"
import {
  OPENAI_API_KEY,
  OPENAI_REALTIME_MODEL,
  OPENAI_PROMPT_ID,
  OPENAI_PROMPT_VERSION,
} from "../../config"

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
    })

    this.ws.on("error", err => {
      console.error(ts(), "❌ OPENAI SOCKET ERROR", err)
      this.onError(err)
    })

    this.ws.on("message", data => {
      const evt = JSON.parse(data.toString())
      console.log(ts(), "📥 OPENAI → SERVER", evt.type)

      /* ================= USER TRANSCRIPT ================= */
      if (evt.type === "conversation.item.input_audio_transcription.completed") {
        const text =
          evt.transcript ||
          evt.item?.content?.[0]?.text ||
          evt.item?.content?.[0]?.transcript ||
          ""

        console.log(ts(), "📝 USER TRANSCRIPT:", text)

        this.onEvent({
          type: "user_transcript",
          text,
        })
        return
      }

      /* ================= ASSISTANT TRANSCRIPT ================= */
      if (evt.type === "response.audio_transcript.done") {
        console.log(ts(), "🤖 ASSISTANT TRANSCRIPT:", evt.transcript)

        this.onEvent({
          type: "assistant_text",
          text: evt.transcript,
        })
        return
      }

      /* ================= ASSISTANT AUDIO ================= */
      if (evt.type === "response.audio.delta" && evt.audio) {
        this.onEvent({
          type: "assistant_audio",
          audio: evt.audio,
        })
        return
      }
    })
  }

  /* ===================================================== */
  /* 🔑 PROMPT + VERSION INTEGRATION (CORRECT WAY) */
  /* ===================================================== */
  private configureSession() {
    console.log(
      ts(),
      "🤖 USING PROMPT:",
      OPENAI_PROMPT_ID,
      "v",
      OPENAI_PROMPT_VERSION
    )

    this.send({
      type: "session.update",
      session: {
        /* 🎧 AUDIO */
        modalities: ["audio", "text"],
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",

        /* 📝 SPEECH → TEXT */
        input_audio_transcription: {
          model: "gpt-4o-transcribe",
          language: "auto",
        },

        /* 🤖 YOUR AGENT PROMPT */
        prompt: {
          id: OPENAI_PROMPT_ID,
          version: OPENAI_PROMPT_VERSION,
        },
      },
    })
  }

  sendAudio(audio: string) {
    this.hasAudio = true
    this.send({
      type: "input_audio_buffer.append",
      audio,
    })
  }

  endAudio() {
    if (!this.hasAudio) return

    console.log(ts(), "📤 COMMIT + RESPONSE.CREATE")

    this.send({ type: "input_audio_buffer.commit" })
    this.send({
      type: "response.create",
      response: { modalities: ["audio", "text"] },
    })

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
}

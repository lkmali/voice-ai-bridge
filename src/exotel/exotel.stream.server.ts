import { Server } from "http"
import { WebSocketServer } from "ws"
import { OpenAIRealtimeConnection } from "./open-ai/openaiRealtime"

function log(streamSid: string | null, ...args: any[]) {
  console.log(new Date().toISOString(), `[STREAM ${streamSid ?? "-"}]`, ...args)
}

export function createExotelStreamServer(server: Server, path = "/exotel-media") {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.split("?")[0] === path) {
      wss.handleUpgrade(req, socket, head, ws => {
        wss.emit("connection", ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on("connection", ws => {
    let streamSid: string | null = null
    let lastCommit = Date.now()

    const ai = new OpenAIRealtimeConnection(
      evt => {
        /* 🎧 SEND AI AUDIO BACK */
        if (evt.type === "assistant_audio" && streamSid) {
          ws.send(JSON.stringify({
            event: "media",
            stream_sid: streamSid,
            media: { payload: evt.audio }
          }))
        }

        /* 📝 USER TRANSCRIPT */
        if (evt.type === "user_transcript") {
          log(streamSid, "👤 USER SAID:", evt.text)
          ws.send(JSON.stringify(evt))
        }

        /* 🤖 ASSISTANT TRANSCRIPT */
        if (evt.type === "assistant_text") {
          log(streamSid, "🤖 AI SAID:", evt.text)
          ws.send(JSON.stringify(evt))
        }
      },
      () => log(streamSid, "🤖 OPENAI READY"),
      err => log(streamSid, "❌ OPENAI ERROR", err)
    )

    ws.on("message", raw => {
      const msg = JSON.parse(raw.toString())

      if (msg.event === "start") {
        streamSid = msg.stream_sid
        log(streamSid, "📞 STREAM STARTED")
      }

      if (msg.event === "media" && msg.media?.payload) {
        ai.sendAudio(msg.media.payload)

        if (Date.now() - lastCommit > 3000) {
          ai.endAudio()
          lastCommit = Date.now()
        }
      }

      if (msg.event === "stop") {
        log(streamSid, "🛑 STREAM STOP")
        ai.endAudio()
      }
    })

    ws.on("close", () => {
      log(streamSid, "❎ WS CLOSED")
      ai.close()
    })
  })
}

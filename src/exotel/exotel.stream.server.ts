// exotel.stream.server.ts
import { WebSocketServer } from "ws"
import { OpenAIRealtime } from "./open-ai/openaiRealtime"
import { pcm16ToG711 } from "./g711"
import { silenceG711Base64 } from "./silence"
import { Server } from "http"

export function createExotelStreamServer(server: Server, path: string) {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    if (req.url === path) {
      wss.handleUpgrade(req, socket, head, ws => {
        wss.emit("connection", ws)
      })
    } else socket.destroy()
  })

  wss.on("connection", ws => {
    let streamSid = ""
    let silenceTimer: NodeJS.Timeout

    const ai = new OpenAIRealtime(
      pcm16 => {
        ws.send(JSON.stringify({
          event: "media",
          stream_sid: streamSid,
          media: { payload: pcm16ToG711(pcm16) },
        }))
      },
      text => console.log("👤 USER:", text),
      text => console.log("🤖 AI:", text),
      () => {
        console.log("🛑 BARGE-IN")
        ai.truncate()
      }
    )

    // 🔥 Silence padding (critical)
    silenceTimer = setInterval(() => {
      ws.send(JSON.stringify({
        event: "media",
        stream_sid: streamSid,
        media: { payload: silenceG711Base64() },
      }))
    }, 200)

    ws.on("message", raw => {
      const msg = JSON.parse(raw.toString())

      if (msg.event === "start") {
        streamSid = msg.stream_sid
        console.log("📞 CALL START", streamSid)
      }

      if (msg.event === "media") {
        ai.sendAudio(msg.media.payload)
      }

      if (msg.event === "stop") {
        console.log("📞 CALL STOP", streamSid)
        ai.endTurn()
        clearInterval(silenceTimer)
      }
    })

    ws.on("close", () => {
      clearInterval(silenceTimer)
      ai.close()
    })
  })
}

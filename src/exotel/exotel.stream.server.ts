import { Server } from "http"
import { WebSocketServer } from "ws"
import { OpenAIRealtimeConnection } from "./open-ai/openaiRealtime"
import { logger } from "../logger"

function ts() {
  return new Date().toISOString()
}

export function createExotelStreamServer(
  server: Server,
  path = "/exotel-media"
) {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0]
    if (pathname === path) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on("connection", (ws, req) => {
    console.log(ts(), "📞 EXOTEL WS CONNECTED", req.url)

    let streamSid: string | null = null
    let lastCommit = Date.now()
    const FORCE_COMMIT_MS = 1200

    const ai = new OpenAIRealtimeConnection(
      (evt) => {
        if (
          evt.type === "response.output_audio.delta" &&
          evt.audio &&
          streamSid
        ) {
          console.log(ts(), "🔊 OPENAI → EXOTEL AUDIO", evt.audio.length)

          ws.send(
            JSON.stringify({
              event: "media",
              stream_sid: streamSid,
              media: { payload: evt.audio },
            })
          )
        }
      },
      () => console.log(ts(), "🤖 OPENAI READY"),
      (err) => console.error(ts(), "❌ OPENAI ERROR", err)
    )

    // Heartbeat to Exotel
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping()
    }, 5000)

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        console.log(ts(), "📥 EXOTEL → SERVER", msg.event)

        switch (msg.event) {
          case "connected":
            console.log(ts(), "🔗 EXOTEL CONNECTED")
            break

          case "start":
            streamSid = msg.stream_sid
            console.log(ts(), "▶️ STREAM START", {
              streamSid,
              callSid: msg.start?.call_sid,
              sampleRate: msg.start?.media_format?.sample_rate,
            })
            break

          case "media":
            if (msg.media?.payload) {
              console.log(
                ts(),
                "🎙 EXOTEL AUDIO → OPENAI",
                msg.media.payload.length
              )

              ai.sendAudio(msg.media.payload)

              const now = Date.now()
              if (now - lastCommit > FORCE_COMMIT_MS) {
                console.log(ts(), "📤 FORCE COMMIT AUDIO")
                ai.endAudio()
                lastCommit = now
              }
            }
            break

          case "dtmf":
            console.log(ts(), "📟 DTMF", msg.dtmf?.digit)
            break

          case "stop":
            console.log(ts(), "⏹ EXOTEL STOP", msg.stop?.reason)
            cleanup()
            break
        }
      } catch (e) {
        console.error(ts(), "❌ INVALID EXOTEL PAYLOAD", e)
      }
    })

    ws.on("close", () => {
      console.log(ts(), "🔌 EXOTEL WS CLOSED")
      cleanup()
    })

    ws.on("error", (e) => {
      console.error(ts(), "❌ EXOTEL WS ERROR", e)
      cleanup()
    })

    function cleanup() {
      clearInterval(pingInterval)
      ai.endAudio()
      ai.close()
      try {
        ws.close()
      } catch {}
    }
  })

  return wss
}

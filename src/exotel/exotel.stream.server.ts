import { Server } from "http"
import WebSocket, { WebSocketServer } from "ws"
import { OpenAIRealtimeConnection } from "./open-ai/openaiRealtime"
import { logger } from "../logger"

export function createExotelStreamServer(
  server: Server,
  path = "/exotel-media"
) {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    if (req.url === path) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on("connection", (ws) => {
    logger.info("📞 Exotel media WebSocket connected")

    // Respond to ping frames to avoid premature disconnect
    ws.on("ping", () => {
      ws.pong()
    })

    const ai = new OpenAIRealtimeConnection(
      (evt) => {
        // Send AI audio back to Exotel
        if (evt.type === "response.output_audio.delta" && evt.audio) {
          ws.send(
            JSON.stringify({
              event: "media",
              media: { payload: evt.audio },
            })
          )
        }
      },
      () => logger.info("🤖 OpenAI realtime ready"),
      (err) => logger.error("❌ OpenAI error", err)
    )

    let commitTimer: NodeJS.Timeout | null = null
    const COMMIT_MS = 600

    ws.on("message", (raw) => {
      try {
        const text = raw.toString("utf8")

        // 🔥 Check if message is JSON
        if (text.startsWith("{")) {
          const msg = JSON.parse(text)

          if (msg.event === "start") {
            logger.info("▶️ Exotel stream started")
          }

          if (msg.event === "media" && msg.media?.payload) {
            ai.sendAudio(msg.media.payload)

            if (commitTimer) clearTimeout(commitTimer)
            commitTimer = setTimeout(() => {
              ai.endAudio()
              commitTimer = null
            }, COMMIT_MS)
          }

          if (msg.event === "stop") {
            logger.info("⏹ Exotel stream stopped")
            if (commitTimer) clearTimeout(commitTimer)
            ai.endAudio()
            ai.close()
            ws.close()
          }

          return
        }

        // 🔥 Non-JSON frame received (binary ping/pong or other)
        logger.warn("Received non-JSON frame from Exotel (ignored)")
      } catch (err) {
        logger.error("Invalid Exotel payload", err)
      }
    })

    ws.on("close", () => {
      logger.info("🔌 Exotel media socket closed")
      if (commitTimer) clearTimeout(commitTimer)
      ai.close()
    })
  })

  return wss
}

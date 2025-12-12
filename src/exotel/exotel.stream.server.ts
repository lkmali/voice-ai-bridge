import { Server as HttpServer } from "http"
import WebSocket, { WebSocketServer } from "ws"
import { OpenAIRealtimeConnection } from "../open-ai/openaiRealtime"
import { logger } from "../logger"
import { EXOTEL_STREAM_PATH } from "../config"

export function createExotelStreamServer(
  server: HttpServer,
  path = EXOTEL_STREAM_PATH
) {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    if (!req.url) return socket.destroy()
    if (req.url === path) {
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit("connection", ws, req)
      )
    } else socket.destroy()
  })

  wss.on("connection", (ws: WebSocket) => {
    logger.info("📞 Exotel media WebSocket connected")

    const ai = new OpenAIRealtimeConnection(
      (evt) => {
        // when OpenAI returns audio delta frames we must forward to Exotel
        if (evt.type === "response.output_audio.delta" && evt.audio) {
          // OpenAI sends base64 PCM16 chunks in evt.audio
          // Exotel expects a JSON frame: { event: "media", media: { payload: "<base64>" } }
          const payload = JSON.stringify({
            event: "media",
            media: { payload: evt.audio },
          })
          try {
            ws.send(payload)
          } catch (e) {
            logger.error("Failed to forward audio to Exotel", e)
          }
        }

        // other events can be logged or used for analytics
        // e.g., response.completed, output_text.delta
      },
      () => logger.info("🤖 OpenAI realtime ready"),
      (err) => logger.error("❌ OpenAI error", err)
    )

    let commitTimer: NodeJS.Timeout | null = null
    const COMMIT_MS = 600 // debounce audio commits

    ws.on("message", (raw) => {
      // Exotel sends JSON frames. Example: { event: 'start' } or { event: 'media', media: { payload: '<base64>' } }
      try {
        const msg = JSON.parse(raw.toString())

        if (msg.event === "start") {
          logger.info("▶️ Exotel stream started")
          return
        }

        if (msg.event === "media" && msg.media?.payload) {
          // Exotel media.payload is base64 PCM16 (per their docs). Forward to OpenAI
          ai.sendAudio(msg.media.payload)

          // debounce commit: when audio stops for COMMIT_MS -> tell OpenAI to create response
          if (commitTimer) clearTimeout(commitTimer)
          commitTimer = setTimeout(() => {
            ai.endAudio()
            commitTimer = null
          }, COMMIT_MS)
          return
        }

        if (msg.event === "stop") {
          logger.info("⏹ Exotel stream stopped")
          if (commitTimer) clearTimeout(commitTimer)
          ai.endAudio()
          ai.close()
          ws.close()
          return
        }

        // sometimes Exotel sends control frames. Log them.
        logger.debug("Exotel frame:", msg)
      } catch (err) {
        logger.error("Invalid Exotel payload", err)
      }
    })

    ws.on("close", () => {
      logger.info("🔌 Exotel media socket closed")
      if (commitTimer) clearTimeout(commitTimer)
      ai.close()
    })

    ws.on("error", (err) => {
      logger.error("Exotel WS error", err)
      if (commitTimer) clearTimeout(commitTimer)
      ai.close()
    })
  })

  return wss
}

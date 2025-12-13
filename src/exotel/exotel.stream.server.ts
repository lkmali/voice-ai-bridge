import { Server } from "http"
import { WebSocketServer } from "ws"
import { OpenAIRealtimeConnection } from "./open-ai/openaiRealtime"
import { logger } from "../logger"

export function createExotelStreamServer(
  server: Server,
  path = "/exotel-media"
) {
  const wss = new WebSocketServer({ noServer: true })

  // --- Handle HTTP → WebSocket upgrade (important for ?sample-rate)
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
    logger.info("📞 Exotel media WebSocket connected", req.url)

    let streamSid: string | null = null
    let commitTimer: NodeJS.Timeout | null = null
    const COMMIT_MS = 600

    // --- OpenAI realtime connection
    const ai = new OpenAIRealtimeConnection(
      (evt) => {
        // 🔴 Exotel REQUIRES stream_sid in every media frame
        if (
          evt.type === "response.output_audio.delta" &&
          evt.audio &&
          streamSid
        ) {
          ws.send(
            JSON.stringify({
              event: "media",
              stream_sid: streamSid,
              media: {
                payload: evt.audio,
              },
            })
          )
        }
      },
      () => logger.info("🤖 OpenAI realtime ready"),
      (err) => logger.error("❌ OpenAI realtime error", err)
    )

    // --- Keepalive
    ws.on("ping", () => ws.pong())

    ws.on("message", (raw) => {
      try {
        const text = raw.toString("utf8")
        if (!text.startsWith("{")) return

        const msg = JSON.parse(text)

        switch (msg.event) {
          case "connected":
            logger.info("🔗 Exotel connected event")
            break

          case "start":
            streamSid = msg.stream_sid
            logger.info("▶️ Exotel stream started", {
              streamSid,
              callSid: msg.start?.call_sid,
              sampleRate: msg.start?.media_format?.sample_rate,
            })
            break

          case "media":
            if (msg.media?.payload) {
              ai.sendAudio(msg.media.payload)

              if (commitTimer) clearTimeout(commitTimer)
              commitTimer = setTimeout(() => {
                ai.endAudio()
                commitTimer = null
              }, COMMIT_MS)
            }
            break

          case "dtmf":
            logger.info("📟 DTMF received", msg.dtmf?.digit)
            break

          case "stop":
            logger.info("⏹ Exotel stream stopped", msg.stop?.reason)
            cleanup()
            break
        }
      } catch (err) {
        logger.error("❌ Invalid Exotel WS payload", err)
      }
    })

    ws.on("close", () => {
      logger.info("🔌 Exotel media socket closed")
      cleanup()
    })

    ws.on("error", (err) => {
      logger.error("❌ WebSocket error", err)
      cleanup()
    })

    function cleanup() {
      if (commitTimer) clearTimeout(commitTimer)
      ai.endAudio()
      ai.close()
      try {
        ws.close()
      } catch {}
    }
  })

  return wss
}

import express from "express"
import { triggerExotelAIStreamCall } from "../exotel.client"
import { logger } from "../logger"
import { EXOTEL_STREAM_PATH, PUBLIC_HOST } from "../config"

const router = express.Router()

/**
 * Health check
 */
router.get("/health", (req, res) => {
  res.json({ ok: true, message: "I AM RUNNING" })
})

/**
 * POST /api/call
 * Only `from` is required for Flow v1.
 * Flow App handles routing, EXOML, and WebSocket connection.
 */
router.post("/call", async (req, res) => {
  const { from } = req.body
  if (!from) {
    return res.status(400).json({ error: "`from` is required" })
  }

  try {
    const result = await triggerExotelAIStreamCall(from)
    logger.info("Exotel connect response", result)
    res.json({ ok: true, result })
  } catch (err: any) {
    logger.error(
      "Failed to trigger Exotel connect",
      err?.response?.data || err.toString()
    )
    res.status(500).json({
      ok: false,
      error: err?.response?.data || err.toString(),
    })
  }
})

router.post("/call-information", async (req, res) => {
  const { from } = req.body
  console.log("post-->call-information-->body", req.body)

  console.log("post-->headers", req.headers)
  res.json({ ok: true, message: "Call information received" })
})

router.get("/call-information", async (req, res) => {
  const query = req.query
  const headers = req.headers
  console.log("GET-->From", query)

  console.log("GET-->headers", headers)
  res.json({ ok: true, message: "Call information received" })
})

/**
 * EXOML endpoint — Exotel Flow v1 Passthru calls this.
 * This EXOML tells Exotel to start streaming audio to your WebSocket.
 */
router.get("/exoml/ai", (req, res) => {
  console.log("Exotel requested EXOML", req.headers)
  const wsUrl = `wss://${PUBLIC_HOST}${EXOTEL_STREAM_PATH}?sample-rate=8000`
  logger.info("Exotel Voicebot requested WSS", wsUrl)
  res.json({
    url: wsUrl,
  })
})

export default router

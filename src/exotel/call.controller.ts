import express from "express"
import { triggerExotelAIStreamCall } from "../exotel.client"
import { logger } from "../logger"
import { EXOTEL_STREAM_PATH, PUBLIC_HOST, STREAM_URL } from "../config"

const router = express.Router()

router.get("/health", (req, res) => {
  res.json({ message: "I MA RUNNING" })
})
/**
 * POST /api/call
 * { from: "+91...", to: "+91..." }
 */
router.post("/call", async (req, res) => {
  const { from, to } = req.body
  if (!from) return res.status(400).json({ error: "from and to are required" })

  try {
    const result = await triggerExotelAIStreamCall(from)
    logger.info("Exotel connect response", result)
    res.json({ ok: true, result })
  } catch (err) {
    logger.error("Failed to trigger Exotel connect", err)
    res.status(500).json({ ok: false, error: (err as any).toString() })
  }
})

router.get("/exoml/ai", (req, res) => {
  console.log("Exotel requested EXOML") // SAFE

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TwilioResponse>
    <StartAudioStream url="wss://voice.aiplustechnology.com/exotel-media"/>
    <Say>Connecting you to AI...</Say>
    <Pause length="1800"/>
</TwilioResponse>
`

  res.set("Content-Type", "text/xml")
  res.send(xml)
})

export default router

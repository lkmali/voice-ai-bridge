import express from "express"
import { triggerExotelAIStreamCall } from "../exotel.client"
import { logger } from "../logger"
import { EXOTEL_STREAM_PATH, PUBLIC_HOST, STREAM_URL } from "../config"

const router = express.Router()

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
  console.log("I AM CALLING THE exoml API", req.headers)
  console.log("I AM CALLING THE exoml API", req)
  const streamUrl = STREAM_URL

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TwilioResponse>
  <StartAudioStream url="${streamUrl}" />
  <Pause length="1800" />
</TwilioResponse>`

  res.type("text/xml").send(xml)
})

export default router

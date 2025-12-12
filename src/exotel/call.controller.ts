import express from "express"
import { triggerExotelAIStreamCall } from "../exotel.client"
import { logger } from "../logger"

const router = express.Router()

router.get("/health", (req, res) => res.json({ ok: true, message: "running" }))

router.post("/call", async (req, res) => {
  const { from, to } = req.body
  if (!from) return res.status(400).json({ error: "`from` is required" })

  try {
    const result = await triggerExotelAIStreamCall(from, to)
    logger.info("Exotel connect response", result)
    return res.json({ ok: true, result })
  } catch (err: any) {
    logger.error(
      "Failed to trigger Exotel connect",
      err?.response?.data || err?.toString()
    )
    return res.status(500).json({ ok: false, error: err?.toString() })
  }
})

export default router

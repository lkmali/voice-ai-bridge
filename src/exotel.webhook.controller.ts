import express from "express";
import { logger } from "./logger";
import { PUBLIC_HOST, EXOTEL_STREAM_PATH } from "./config";

const router = express.Router();

/**
 * Incoming call webhook - Exotel requests this when a call reaches your ExoPhone.
 * We respond with simple ExoML that starts a stream to our WSS, then plays greeting (optional).
 *
 * IMPORTANT: Exotel's exact ExoML syntax or required tags can differ. Test and adjust to your account.
 */
router.post("/incoming", (req, res) => {
  const { CallSid, From, To } = req.body;
  logger.info("Incoming call webhook:", { CallSid, From, To });

  // Build StreamUrl reachable by Exotel (wss)
  const streamUrl = `wss://${PUBLIC_HOST.replace(/^https?:\/\//, "")}${EXOTEL_STREAM_PATH}`;

  // Basic ExoML - ask Exotel to start streaming audio to our WSS
  // NOTE: Exotel's ExoML tags may differ; consult Exotel docs / applet templates if this fails
  const exoml = `<?xml version="1.0" encoding="UTF-8"?>
<TwilioResponse>
  <StartAudioStream url="${streamUrl}" />
  <!-- Optionally play a greeting file (hosted publicly) -->
  <!-- <Play>https://your.cdn/greeting.wav</Play> -->
  <Pause length="1800" />
</TwilioResponse>`;

  res.type("text/xml").send(exoml);
});

/**
 * Status callback - Exotel calls this when events (terminal/answered) happen.
 */
router.post("/status", (req, res) => {
  const payload = req.body;
  logger.info("Exotel status callback:", payload.EventType || payload.Event || "status", payload.CallSid || "");
  // You can store call status in DB here
  res.sendStatus(200);
});

export default router;

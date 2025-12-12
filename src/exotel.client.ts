// src/exotel.client.ts
import axios from "axios"
import FormData from "form-data"
import { EXOTEL, EXOTEL_CALL_URL } from "./config"
import { logger } from "./logger"

/**
 * Triggers the Exotel Flow App (EXOML) which will then fetch your EXOML endpoint
 * (e.g. https://your-host/api/exoml/ai) and start the StartAudioStream -> WSS flow.
 *
 * IMPORTANT:
 * - EXOTEL_CALL_URL must be set to the Flow App trigger URL:
 *   https://my.exotel.com/<ACCOUNT_SID>/exoml/start_voice/<APP_ID>
 * - Do NOT send StreamUrl / StreamBegin here. Just POST the FLOW URL (Url param).
 */
export async function triggerExotelAIStreamCall(from: string) {
  if (!EXOTEL_CALL_URL) {
    throw new Error(
      "EXOTEL_CALL_URL not configured (must be the Flow App start_voice URL)."
    )
  }

  const fd = new FormData()
  fd.append("From", from)
  fd.append("CallerId", EXOTEL.CALLER_ID || "") // ensure CALLER_ID is set in env/config

  // This is the key for Flow App: pass the flow trigger URL as Url
  // Example: "https://my.exotel.com/anantkaya1m/exoml/start_voice/34173"
  fd.append("Url", EXOTEL_CALL_URL)

  const connectUrl = `https://${EXOTEL.SUBDOMAIN}/v1/Accounts/${EXOTEL.SID}/Calls/connect`
  const auth = Buffer.from(`${EXOTEL.API_KEY}:${EXOTEL.API_TOKEN}`).toString(
    "base64"
  )

  logger.info("Triggering Exotel FLOW call (EXOML)", {
    connectUrl,
    flowUrl: EXOTEL_CALL_URL,
    from,
  })

  try {
    const res = await axios.post(connectUrl, fd, {
      headers: {
        Authorization: `Basic ${auth}`,
        ...fd.getHeaders(),
      },
      timeout: 15000,
    })

    logger.info("Exotel /Calls/connect response", res?.data)
    return res.data
  } catch (err: any) {
    // Make error easier to debug by including response body if available
    logger.error(
      "Exotel call trigger failed",
      err?.response?.status,
      err?.response?.data || err?.message
    )
    throw err
  }
}

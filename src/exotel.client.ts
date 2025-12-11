import axios from "axios"
import FormData from "form-data"
import { EXOTEL, EXOTEL_CALL_URL, PUBLIC_HOST, STREAM_URL } from "./config"
import { logger } from "./logger"

export async function triggerExotelAIStreamCall(from: string) {
  const fd = new FormData()
  //   fd.append("From", from)
  //   fd.append("CallerId", EXOTEL.CALLER_ID)

  //   // Exotel will fetch this XML which tells it to start streaming audio
  //   const exomlUrl = `https://${PUBLIC_HOST}/api/exoml/ai`
  //   fd.append("Url", exomlUrl)

  fd.append("From", from)
  // fd.append("To", "+918442033493")
  fd.append("CallerId", EXOTEL.CALLER_ID)
  //fd.append("StreamUrl", STREAM_URL)
  fd.append("Url", EXOTEL_CALL_URL)
  fd.append("StreamBegin", "atLeg1connect")

  console.log("STREAM_URL", EXOTEL_CALL_URL)
  const url = `https://${EXOTEL.SUBDOMAIN}/v1/Accounts/${EXOTEL.SID}/Calls/connect`
  const auth = Buffer.from(`${EXOTEL.API_KEY}:${EXOTEL.API_TOKEN}`).toString(
    "base64"
  )

  logger.info("Triggering AI STREAM CALL:", { from })

  const res = await axios.post(url, fd, {
    headers: {
      Authorization: `Basic ${auth}`,
      ...fd.getHeaders(),
    },
  })

  return res.data
}

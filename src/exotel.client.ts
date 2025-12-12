
/* =========================
   File: src/exotel.client.ts
   Exotel Voice v3 (POST /v3/accounts/{sid}/calls)
   ========================= */
import axios from "axios";
import { EXOTEL, PUBLIC_HOST } from "./config";
import { logger } from "./logger";

export async function triggerExotelAIStreamCall(from: string, to?: string) {
  if (!EXOTEL.SID || !EXOTEL.API_KEY || !EXOTEL.API_TOKEN) {
    throw new Error("Exotel credentials are missing in env vars");
  }

  const url = `https://${EXOTEL.SUBDOMAIN}/v3/accounts/${EXOTEL.SID}/calls`;

  const streamingUrl = `wss://${PUBLIC_HOST.replace(/^https?:\/\//, "")}${process.env.EXOTEL_STREAM_PATH || "/exotel-media"}`;

  const body: any = {
    from: { contact_uri: from, state_management: true },
    to: to ? { contact_uri: to } : undefined,
    virtual_number: EXOTEL.VIRTUAL_NUMBER || undefined,
    streaming: { url: streamingUrl, begin: "from_leg_connect" },
  };

  logger.info("Triggering Exotel v3 Stream Call", { url, body: { ...body, from: { contact_uri: from } } });

  const auth = Buffer.from(`${EXOTEL.API_KEY}:${EXOTEL.API_TOKEN}`).toString("base64");

  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });

  return res.data;
}

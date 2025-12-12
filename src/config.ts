export const PUBLIC_HOST =
  process.env.PUBLIC_HOST || "voice.aiplustechnology.com"
export const EXOTEL = {
  SID: process.env.EXOTEL_SID || "",
  API_KEY: process.env.EXOTEL_API_KEY || "",
  API_TOKEN: process.env.EXOTEL_API_TOKEN || "",
  SUBDOMAIN: process.env.EXOTEL_SUBDOMAIN || "ccm-api.in.exotel.com",
  CALLER_ID: process.env.EXOTEL_CALLER_ID || "",
  VIRTUAL_NUMBER: process.env.EXOTEL_VIRTUAL_NUMBER || "",
}
export const EXOTEL_STREAM_PATH =
  process.env.EXOTEL_STREAM_PATH || "/exotel-media"
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""
export const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17"
export const PORT = Number(process.env.PORT || 3000)

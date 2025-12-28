import dotenv from "dotenv"
dotenv.config()

export const APP_PORT = Number(process.env.APP_PORT || 8080)

export const EXOTEL = {
  API_KEY: process.env.EXOTEL_API_KEY || "",
  API_TOKEN: process.env.EXOTEL_API_TOKEN || "",
  SID: process.env.EXOTEL_SID || "",
  SUBDOMAIN: process.env.EXOTEL_SUBDOMAIN || "api.in.exotel.com",
  CALLER_ID: process.env.EXOTEL_CALLER_ID || "",
}

export const EXOTEL_STREAM_PATH =
  process.env.EXOTEL_STREAM_PATH || "/exotel-media"
export const PUBLIC_HOST =
  process.env.PUBLIC_HOST || "https://your.public.domain"
export const STREAM_URL = process.env.STREAM_URL
export const EXOTEL_CALL_URL = process.env.EXOTEL_CALL_URL
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""
export const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-realtime"
  export const OPENAI_PROMPT_ID =
  process.env.OPENAI_PROMPT_ID || "prompt-1234567890"
export const OPENAI_PROMPT_VERSION =
  process.env.OPENAI_PROMPT_VERSION || "5"
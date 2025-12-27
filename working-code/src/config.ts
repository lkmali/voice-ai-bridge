import dotenv from "dotenv"

dotenv.config()

export const APP_PORT = Number(process.env.PORT || 3000)

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""
export const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-realtime"

console.log("OPENAI_API_KEY", OPENAI_API_KEY)
if (!OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in environment")
}

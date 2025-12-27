import express from "express"
import http from "http"
import { WebSocketServer } from "ws"
import path from "path"
import { APP_PORT } from "./config"
import { OpenAIRealtimeConnection } from "./openaiRealtime"

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: "/ws" })

app.use(express.static(path.join(__dirname, "public")))

wss.on("connection", (clientWs) => {
  const ai = new OpenAIRealtimeConnection(
    // send AI events to client
    (evt) => clientWs.send(JSON.stringify({ type: "ai", evt })),
    () => clientWs.send(JSON.stringify({ type: "ready" })),
    (errInfo) => clientWs.send(JSON.stringify({ type: "error", errInfo }))
  )

  clientWs.on("message", (message) => {
    const data = JSON.parse(message.toString())

    if (data.type === "audio") ai.sendAudio(data.audio)
    if (data.type === "audio_end") ai.endAudio()
  })

  clientWs.on("close", () => ai.close())
})

server.listen(APP_PORT, () => {
  console.log(`🚀 Voice Server Ready: http://localhost:${APP_PORT}`)
})

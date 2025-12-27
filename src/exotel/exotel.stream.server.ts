import { WebSocketServer, WebSocket } from "ws"
import { OpenAIRealtime } from "./open-ai/openaiRealtime"
import { Server } from "http"
import { resample8kTo24k, resample24kTo8k, generate8kSilence } from "./audio-utils"

// 20ms silence at 8kHz (160 bytes PCM16)
const SILENCE_8K = generate8kSilence()

type ClientType = "exotel" | "html" | "unknown"

export function createStreamServer(server: Server, path: string) {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    const url = req.url?.split("?")[0]

    if (url === path) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws)
      })
    }
    // Don't destroy socket - let other handlers try
  })

  wss.on("connection", (ws: WebSocket) => {
    console.log("[STREAM] Client connected")

    // Auto-detect client type from first message
    let clientType: ClientType = "unknown"
    let streamSid: string | null = null
    let markCounter = 0
    let ai: OpenAIRealtime | null = null
    let silenceTimer: NodeJS.Timeout | null = null

    function initializeAI(detectedType: ClientType) {
      if (ai) return // Already initialized
      clientType = detectedType
      console.log(`[STREAM] Detected client type: ${clientType.toUpperCase()}`)

      ai = new OpenAIRealtime(
        // onAudio: Receive 24kHz from OpenAI
        (pcm24k) => {
          if (clientType === "exotel") {
            if (!streamSid) return
            const pcm8k = resample24kTo8k(pcm24k)
            ws.send(
              JSON.stringify({
                event: "media",
                stream_sid: streamSid,
                media: { payload: pcm8k },
              })
            )
          } else {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: "ai",
                  evt: { type: "response.output_audio.delta", delta: pcm24k },
                })
              )
            }
          }
        },
        // onUserText
        (text) => {
          console.log(`[${clientType.toUpperCase()}] USER:`, text)
          if (clientType === "html" && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "ai",
                evt: { type: "conversation.item.input_audio_transcription.completed", transcript: text },
              })
            )
          }
        },
        // onAiText
        (text) => {
          console.log(`[${clientType.toUpperCase()}] AI:`, text)
          if (clientType === "html" && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "ai",
                evt: { type: "response.output_text.done", text },
              })
            )
          }
        },
        // onBargeIn
        () => {
          console.log(`[${clientType.toUpperCase()}] BARGE-IN`)
          if (clientType === "exotel" && streamSid) {
            ws.send(JSON.stringify({ event: "clear", stream_sid: streamSid }))
          }
        },
        // onResponseDone
        () => {
          if (clientType === "exotel" && streamSid) {
            markCounter++
            ws.send(
              JSON.stringify({
                event: "mark",
                stream_sid: streamSid,
                mark: { name: `response-${markCounter}` },
              })
            )
          } else if (clientType === "html" && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "ai",
                evt: { type: "response.completed" },
              })
            )
          }
        },
        // onReady
        () => {
          if (clientType === "html" && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ready" }))
          }
        },
        // onAiTextDelta
        (delta) => {
          if (clientType === "html" && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "ai",
                evt: { type: "response.output_text.delta", delta },
              })
            )
          }
        },
        // onUserTextDelta
        (delta) => {
          if (clientType === "html" && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "ai",
                evt: { type: "conversation.item.input_audio_transcription.delta", delta },
              })
            )
          }
        },
        // onSpeechStopped: Auto-trigger response for Exotel when user stops speaking
        () => {
          if (clientType === "exotel") {
            console.log("[EXOTEL] User stopped speaking, triggering AI response")
            ai?.endTurn()
          }
        }
      )

      // Start silence timer for Exotel
      if (clientType === "exotel") {
        silenceTimer = setInterval(() => {
          if (!streamSid) return
          if (ws.readyState !== WebSocket.OPEN) return
          ws.send(
            JSON.stringify({
              event: "media",
              stream_sid: streamSid,
              media: { payload: SILENCE_8K },
            })
          )
        }, 200)
      }
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString())

        // Auto-detect client type from first message
        if (clientType === "unknown") {
          if (msg.event) {
            // Exotel uses "event" field
            initializeAI("exotel")
          } else if (msg.type) {
            // HTML uses "type" field
            initializeAI("html")
          }
        }

        if (!ai) return

        if (clientType === "exotel") {
          handleExotelMessage(msg, ai, (sid) => { streamSid = sid })
        } else {
          handleHtmlMessage(msg, ai)
        }
      } catch (err) {
        console.error("[STREAM] Error parsing message", err)
      }
    })

    ws.on("close", () => {
      console.log(`[${clientType.toUpperCase()}] Client disconnected`)
      if (silenceTimer) clearInterval(silenceTimer)
      ai?.close()
    })

    ws.on("error", (err) => {
      console.error(`[${clientType.toUpperCase()}] WebSocket error`, err)
    })
  })

  return wss
}

function handleExotelMessage(
  msg: any,
  ai: OpenAIRealtime,
  setStreamSid: (sid: string | null) => void
) {
  switch (msg.event) {
    case "connected":
      console.log("[EXOTEL] Connected event received")
      break

    case "start":
      const sid = msg.stream_sid || msg.start?.stream_sid
      setStreamSid(sid)
      console.log("[EXOTEL] Call started", {
        streamSid: sid,
        callSid: msg.start?.call_sid,
        from: msg.start?.from,
        to: msg.start?.to,
      })
      break

    case "media":
      if (msg.media?.payload) {
        const pcm24k = resample8kTo24k(msg.media.payload)
        ai.sendAudio(pcm24k)
      }
      break

    case "dtmf":
      console.log("[EXOTEL] DTMF received", msg.dtmf?.digit)
      break

    case "mark":
      console.log("[EXOTEL] Mark event received", msg.mark?.name)
      break

    case "stop":
      console.log("[EXOTEL] Call stopped", msg.stop?.reason)
      ai.endTurn()
      setStreamSid(null)
      break
  }
}

function handleHtmlMessage(msg: any, ai: OpenAIRealtime) {
  if (msg.type === "audio") {
    ai.sendAudio(msg.audio)
  }

  if (msg.type === "audio_end") {
    ai.endTurn()
  }
}

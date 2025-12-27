import { Server } from "http"
import { WebSocketServer } from "ws"
import { OpenAIRealtimeConnection } from "./open-ai/openaiRealtime"

/* ===================================================== */
/* PCM16 → G711 μ-law (CORRECT ITU-T) */
/* ===================================================== */

function pcm16ToG711(base64Pcm: string): string {
  const pcm = Buffer.from(base64Pcm, "base64")
  const out = Buffer.alloc(pcm.length / 2)

  for (let i = 0; i < out.length; i++) {
    const sample = pcm.readInt16LE(i * 2)
    out[i] = linearToMulaw(sample)
  }

  return out.toString("base64")
}

function linearToMulaw(sample: number): number {
  const MAX = 32635
  let sign = 0

  if (sample < 0) {
    sign = 0x80
    sample = -sample
  }

  if (sample > MAX) sample = MAX
  sample += 132

  let exponent = 7
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0f
  return ~(sign | (exponent << 4) | mantissa) & 0xff
}

/* ===================================================== */
/* EXOTEL STREAM SERVER */
/* ===================================================== */

export function createExotelStreamServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/exotel-media") {
      wss.handleUpgrade(req, socket, head, ws => {
        wss.emit("connection", ws)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on("connection", ws => {
    let streamSid = ""

    const ai = new OpenAIRealtimeConnection(
      pcmBase64 => {
        ws.send(JSON.stringify({
          event: "media",
          stream_sid: streamSid,
          media: {
            payload: pcm16ToG711(pcmBase64),
          },
        }))
      },
      text => console.log("👤 USER:", text),
      text => console.log("🤖 AI:", text)
    )

    ws.on("message", raw => {
      const msg = JSON.parse(raw.toString())

      if (msg.event === "start") {
        streamSid = msg.stream_sid
        console.log("📞 CALL START", streamSid)
      }

      if (msg.event === "media" && msg.media?.payload) {
        ai.sendAudio(msg.media.payload)
      }

      if (msg.event === "stop") {
        console.log("📞 CALL STOP", streamSid)
        ai.endAudio()
      }
    })

    ws.on("close", () => ai.close())
  })
}

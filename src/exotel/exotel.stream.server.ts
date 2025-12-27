import { WebSocketServer } from "ws";
import { OpenAIRealtime } from "./open-ai/openaiRealtime";
import { Server } from "http";

// 20ms silence (320 bytes PCM16)
const SILENCE = Buffer.alloc(320, 0).toString("base64");

export function createExotelStreamServer(server: Server, path: string) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === path) {
      wss.handleUpgrade(req, socket, head, ws =>
        wss.emit("connection", ws)
      );
    } else socket.destroy();
  });

  wss.on("connection", ws => {
    let streamSid: string | null = null;

    const ai = new OpenAIRealtime(
      pcm => {
        if (!streamSid) return;
        ws.send(JSON.stringify({
          event: "media",
          stream_sid: streamSid,
          media: { payload: pcm },
        }));
      },
      t => console.log("👤 USER:", t),
      t => console.log("🤖 AI:", t),
      () => {
        console.log("🛑 BARGE-IN");
        ws.send(JSON.stringify({ event: "clear", stream_sid: streamSid }));
      }
    );

    // Silence padding — REQUIRED
    const silenceTimer = setInterval(() => {
      if (!streamSid) return;
      ws.send(JSON.stringify({
        event: "media",
        stream_sid: streamSid,
        media: { payload: SILENCE },
      }));
    }, 200);

    ws.on("message", raw => {
      const msg = JSON.parse(raw.toString());

      if (msg.event === "start") {
        streamSid = msg.stream_sid;
        console.log("📞 CALL START", streamSid);
      }

      if (msg.event === "media") {
        ai.sendAudio(msg.media.payload);
      }

      if (msg.event === "stop") {
        console.log("📞 CALL STOP", streamSid);
        ai.endTurn();
        streamSid = null;
      }
    });

    ws.on("close", () => {
      clearInterval(silenceTimer);
      ai.close();
    });
  });
}

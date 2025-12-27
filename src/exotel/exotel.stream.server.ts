import { WebSocketServer } from "ws";
import { OpenAIRealtime } from "./open-ai/openaiRealtime";
import { Server } from "http";

const SILENCE_PCM16 = Buffer.alloc(320, 0).toString("base64"); // 20ms silence

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
    let streamSid = "";
    let silenceTimer: NodeJS.Timeout;

    const ai = new OpenAIRealtime(
      pcm16 => {
        ws.send(JSON.stringify({
          event: "media",
          stream_sid: streamSid,
          media: { payload: pcm16 }
        }));
      },
      text => console.log("👤 USER:", text),
      text => console.log("🤖 AI:", text),
      () => console.log("🛑 BARGE-IN")
    );

    // Silence padding (prevents auto hangup)
    silenceTimer = setInterval(() => {
      if (!streamSid) return;
      ws.send(JSON.stringify({
        event: "media",
        stream_sid: streamSid,
        media: { payload: SILENCE_PCM16 }
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
        clearInterval(silenceTimer);
        ai.close();
      }
    });

    ws.on("close", () => {
      clearInterval(silenceTimer);
      ai.close();
    });
  });
}

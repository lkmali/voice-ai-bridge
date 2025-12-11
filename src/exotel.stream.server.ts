import { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { OpenAIRealtimeConnection } from "./openaiRealtime";
import { logger } from "./logger";

/**
 * Create a WebSocketServer that Exotel will connect to.
 * Path should match EXOTEL_STREAM_PATH, defined in config.
 */
export function createExotelStreamServer(server: Server, path = "/exotel-media") {
  const wss = new WebSocketServer({ server, path });

  wss.on("connection", (ws) => {
    logger.info("Exotel Media socket connected");

    // Create an OpenAI realtime connection for this call
    const ai = new OpenAIRealtimeConnection(
      (evt) => {
        // Forward AI audio chunks back to Exotel in Exotel's expected shape
        if (evt.type === "response.output_audio.delta" && evt.audio) {
          // Exotel expects: { event: "media", media: { payload: "<base64>" } }
          ws.send(JSON.stringify({ event: "media", media: { payload: evt.audio } }));
        }

        // other events can be forwarded if needed
      },
      () => {
        logger.info("OpenAI realtime ready");
        // Optionally, notify Exotel that AI is ready.
        // ws.send(JSON.stringify({ event: "ai_ready" }));
      },
      (err) => {
        logger.error("OpenAI error", err);
        try {
          ws.send(JSON.stringify({ event: "error", error: err }));
        } catch {}
      }
    );

    // Buffering and simple commit strategy (VAD-like)
    let commitTimer: NodeJS.Timeout | null = null;
    const SILENCE_COMMIT_MS = 600; // commit when no audio for 600ms

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Exotel typically sends media frames as:
        // { event: 'media', media: { payload: '<base64 audio>' } }
        if (msg.event === "media" && msg.media && msg.media.payload) {
          const payload: string = msg.media.payload;

          // Append to OpenAI
          ai.sendAudio(payload);

          // Reset commit timer
          if (commitTimer) clearTimeout(commitTimer);
          commitTimer = setTimeout(() => {
            try {
              ai.endAudio(); // commit + create response
            } catch (e) {
              logger.error("commit error", e);
            } finally {
              commitTimer = null;
            }
          }, SILENCE_COMMIT_MS);
        }

        if (msg.event === "start") {
          logger.info("Call stream started");
        }

        if (msg.event === "stop") {
          logger.info("Call stream stopped - committing and closing");
          if (commitTimer) clearTimeout(commitTimer);
          ai.endAudio();
          ai.close();
        }
      } catch (err) {
        logger.error("Invalid message from Exotel", err);
      }
    });

    ws.on("close", () => {
      logger.info("Exotel stream connection closed");
      if (commitTimer) clearTimeout(commitTimer);
      ai.close();
    });

    ws.on("error", (err) => {
      logger.error("Exotel stream ws error", err);
      ai.close();
    });
  });

  return wss;
}

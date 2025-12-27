import WebSocket from "ws";
import { OPENAI_REALTIME_MODEL } from "../../config";

export class OpenAIRealtime {
  private ws: WebSocket;
  private ready = false;
  private speaking = false;
  private hasAudio = false;

  constructor(
    private onAudio: (pcm16Base64: string) => void,
    private onUserText: (text: string) => void,
    private onAiText: (text: string) => void,
    private onBargeIn: () => void
  ) {
    this.ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${OPENAI_REALTIME_MODEL}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    this.ws.on("open", () => {
      this.ready = true;
      console.log("🟢 OPENAI READY");

      this.send({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "alloy",

          // EXACT Exotel format
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",

          // Server VAD = low latency + barge-in
          turn_detection: {
            type: "server_vad",
            silence_duration_ms: 600,
            create_response: true,
          },

          input_audio_transcription: {
            model: "gpt-4o-transcribe",
            language: "en",
          },

          instructions:
            "You are a professional call-center voice assistant. Speak English only. Keep answers short and clear.",
        },
      });
    });

    this.ws.on("message", msg => this.handle(JSON.parse(msg.toString())));
    this.ws.on("close", () => console.log("🔴 OPENAI SOCKET CLOSED"));
  }

  private handle(evt: any) {
    if (evt.type === "input_audio_buffer.speech_started" && this.speaking) {
      this.onBargeIn();
      this.cancelResponse();
      return;
    }

    if (evt.type === "response.audio.delta") {
      this.speaking = true;
      this.onAudio(evt.delta);
      return;
    }

    if (evt.type === "response.audio.done") {
      this.speaking = false;
      return;
    }

    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      evt.transcript && this.onUserText(evt.transcript);
      return;
    }

    if (evt.type === "response.audio_transcript.done") {
      evt.transcript && this.onAiText(evt.transcript);
      return;
    }

    if (evt.type === "error") {
      console.error("❌ OPENAI ERROR", evt.error);
    }
  }

  sendAudio(pcm16Base64: string) {
    if (!this.ready) return;
    this.hasAudio = true;
    this.send({ type: "input_audio_buffer.append", audio: pcm16Base64 });
  }

  endTurn() {
    if (!this.hasAudio) return;
    this.send({ type: "input_audio_buffer.commit" });
    this.hasAudio = false;
  }

  cancelResponse() {
    this.send({ type: "response.cancel" });
    this.send({ type: "input_audio_buffer.clear" });
    this.speaking = false;
  }

  close() {
    this.ws.close();
  }

  private send(obj: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }
}

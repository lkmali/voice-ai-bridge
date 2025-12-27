import WebSocket from "ws";

export class OpenAIRealtime {
  private ws: WebSocket;
  private ready = false;
  private speaking = false;

  constructor(
    private onAudio: (pcm16Base64: string) => void,
    private onUserText: (text: string) => void,
    private onAiText: (text: string) => void,
    private onBargeIn: () => void
  ) {
    this.ws = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );

    this.ws.on("open", () => {
      this.ready = true;

      this.ws.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          turn_detection: { type: "server_vad" },
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
          instructions: "You are an English speaking voice assistant."
        }
      }));
    });

    this.ws.on("message", msg => this.handle(JSON.parse(msg.toString())));
  }

  private handle(evt: any) {
    if (evt.type === "input_audio_buffer.speech_started") {
      if (this.speaking) {
        this.onBargeIn();
        this.cancelResponse();
      }
    }

    if (evt.type === "response.audio.delta") {
      this.speaking = true;
      this.onAudio(evt.delta);
    }

    if (evt.type === "response.audio.done") {
      this.speaking = false;
    }

    if (evt.type === "conversation.item.input_audio_transcription.completed") {
      this.onUserText(evt.transcript);
    }

    if (evt.type === "response.audio_transcript.done") {
      this.onAiText(evt.transcript);
    }
  }

  sendAudio(pcm16Base64: string) {
    if (!this.ready) return;
    this.ws.send(JSON.stringify({
      type: "input_audio_buffer.append",
      audio: pcm16Base64
    }));
  }

  endTurn() {
    this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    this.ws.send(JSON.stringify({ type: "response.create" }));
  }

  cancelResponse() {
    this.ws.send(JSON.stringify({ type: "response.cancel" }));
    this.ws.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
  }

  close() {
    this.ws.close();
  }
}

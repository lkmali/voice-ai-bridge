export type Message = {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

export class Memory {
  private history: Message[] = [];

  add(role: "user" | "assistant", text: string) {
    this.history.push({
      role,
      text,
      timestamp: Date.now(),
    });
  }

  getAll() {
    return this.history;
  }

  clear() {
    this.history = [];
  }
}

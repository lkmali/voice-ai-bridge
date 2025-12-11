export class Memory {
  private items: { role: string; text: string }[] = [];

  add(role: string, text: string) {
    this.items.push({ role, text });
  }

  get() {
    return this.items.slice();
  }

  clear() {
    this.items = [];
  }
}

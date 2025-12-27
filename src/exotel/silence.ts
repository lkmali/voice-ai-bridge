// silence.ts
export function silenceG711Base64(): string {
  // μ-law silence = 0xFF
  return Buffer.alloc(160, 0xff).toString("base64") // 20ms @ 8kHz
}

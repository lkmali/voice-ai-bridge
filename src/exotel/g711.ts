// g711.ts
export function pcm16ToG711(base64Pcm: string): string {
  const pcm = Buffer.from(base64Pcm, "base64")
  const out = Buffer.alloc(pcm.length / 2)

  for (let i = 0; i < out.length; i++) {
    const sample = pcm.readInt16LE(i * 2)
    out[i] = linearToMulaw(sample)
  }
  return out.toString("base64")
}

function linearToMulaw(sample: number): number {
  const BIAS = 132
  const CLIP = 32635

  let sign = 0
  if (sample < 0) {
    sign = 0x80
    sample = -sample
  }

  if (sample > CLIP) sample = CLIP
  sample += BIAS

  let exponent = 7
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--
  }

  const mantissa = (sample >> (exponent + 3)) & 0x0f
  return ~(sign | (exponent << 4) | mantissa) & 0xff
}

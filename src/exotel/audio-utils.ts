// audio-utils.ts
// Resampling utilities for Exotel (8kHz) <-> OpenAI (24kHz) conversion

/**
 * Resample 8kHz PCM16 audio to 24kHz PCM16
 * Uses linear interpolation for upsampling (3x)
 */
export function resample8kTo24k(base64Pcm8k: string): string {
  const input = Buffer.from(base64Pcm8k, "base64")
  const inputSamples = input.length / 2
  const outputSamples = inputSamples * 3
  const output = Buffer.alloc(outputSamples * 2)

  for (let i = 0; i < inputSamples; i++) {
    const sample = input.readInt16LE(i * 2)
    const nextSample =
      i < inputSamples - 1 ? input.readInt16LE((i + 1) * 2) : sample

    // Write 3 samples for each input sample (linear interpolation)
    const outIdx = i * 3
    output.writeInt16LE(sample, outIdx * 2)
    output.writeInt16LE(
      Math.round(sample + (nextSample - sample) / 3),
      (outIdx + 1) * 2
    )
    output.writeInt16LE(
      Math.round(sample + ((nextSample - sample) * 2) / 3),
      (outIdx + 2) * 2
    )
  }

  return output.toString("base64")
}

/**
 * Resample 24kHz PCM16 audio to 8kHz PCM16
 * Uses averaging for downsampling (1/3)
 */
export function resample24kTo8k(base64Pcm24k: string): string {
  const input = Buffer.from(base64Pcm24k, "base64")
  const inputSamples = input.length / 2
  const outputSamples = Math.floor(inputSamples / 3)
  const output = Buffer.alloc(outputSamples * 2)

  for (let i = 0; i < outputSamples; i++) {
    const idx = i * 3
    const s1 = input.readInt16LE(idx * 2)
    const s2 = idx + 1 < inputSamples ? input.readInt16LE((idx + 1) * 2) : s1
    const s3 = idx + 2 < inputSamples ? input.readInt16LE((idx + 2) * 2) : s1

    // Average 3 samples into 1
    const avg = Math.round((s1 + s2 + s3) / 3)
    output.writeInt16LE(avg, i * 2)
  }

  return output.toString("base64")
}

/**
 * Generate silence buffer for 8kHz (160 bytes = 20ms)
 */
export function generate8kSilence(): string {
  return Buffer.alloc(160, 0).toString("base64")
}

/**
 * Generate silence buffer for 24kHz (960 bytes = 20ms)
 */
export function generate24kSilence(): string {
  return Buffer.alloc(960, 0).toString("base64")
}

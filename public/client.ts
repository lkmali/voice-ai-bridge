type Role = "user" | "assistant"

interface ChatMessage {
  role: Role
  text: string
}

const micButton = document.getElementById("micButton") as HTMLButtonElement
const statusEl = document.getElementById("status") as HTMLSpanElement
const chatEl = document.getElementById("chat") as HTMLDivElement
const typingEl = document.getElementById("typing") as HTMLDivElement
const waveCanvas = document.getElementById("waveCanvas") as HTMLCanvasElement
const avatarEl = document.getElementById("avatar") as HTMLDivElement
const fileInput = document.getElementById("fileInput") as HTMLInputElement
const textInput = document.getElementById("textInput") as HTMLTextAreaElement
const sendButton = document.getElementById("sendButton") as HTMLButtonElement

let ws: WebSocket | null = null
let micEnabled = false
let audioCtx: AudioContext | null = null
let scriptNode: ScriptProcessorNode | null = null
let mediaStream: MediaStream | null = null

let inputRms = 0

// playback
let playbackCtx: AudioContext | null = null
let playQueue: Float32Array[] = []
let isPlaying = false

// chat state
let userDraft = ""
let assistantDraft = ""

// history (localStorage)
const HISTORY_KEY = "voice_realtime_history_v1"
let chatHistory: ChatMessage[] = []

// ---------- WebSocket ----------

async function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) return

  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const url = `${protocol}//${location.host}/ws`
  ws = new WebSocket(url)

  ws.onopen = () => {
    setStatus("Connected to server. Waiting for OpenAI session…")
  }

  ws.onclose = () => {
    setStatus("Disconnected")
    ws = null
  }

  ws.onerror = () => {
    setStatus("WebSocket error")
  }

  ws.onmessage = (ev: MessageEvent) => {
    const msg = JSON.parse(ev.data)
    if (msg.type === "ready") {
      setStatus("Assistant ready. Hold/click mic and speak.")
    } else if (msg.type === "error") {
      setStatus("Error: " + msg.msg)
    } else if (msg.type === "ai") {
      handleAIEvent(msg.evt)
    }
  }
}

function wsSend(obj: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(obj))
}

// ---------- AI events ----------

function handleAIEvent(evt: any) {
  const type = evt.type
  if (!type) return

  // text output
  if (type === "response.output_text.delta") {
    assistantDraft += evt.delta || ""
    typingEl.textContent = assistantDraft
    setAvatarSpeaking(true)
  }

  if (type === "response.output_text.done") {
    if (assistantDraft.trim()) {
      appendMessage("assistant", assistantDraft.trim(), true)
    }
    assistantDraft = ""
    typingEl.textContent = ""
    setAvatarSpeaking(false)
  }

  // transcript
  if (type === "conversation.item.input_audio_transcription.delta") {
    userDraft += evt.delta || ""
  }

  if (type === "conversation.item.input_audio_transcription.completed") {
    if (userDraft.trim()) {
      appendMessage("user", userDraft.trim(), true)
    }
    userDraft = ""
  }

  // audio out
  if (type === "response.output_audio.delta" && evt.delta) {
    const samples = base64ToFloat32(evt.delta as string)
    queuePlayback(samples)
  }

  if (type === "response.completed") {
    setAvatarSpeaking(false)
  }
}

// ---------- Chat history ----------

function appendMessage(role: Role, text: string, save: boolean) {
  const div = document.createElement("div")
  div.className = `bubble ${role}`
  div.textContent = text
  chatEl.appendChild(div)
  chatEl.scrollTop = chatEl.scrollHeight

  if (save) {
    chatHistory.push({ role, text })
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory))
    } catch {
      // ignore
    }
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return
    const arr = JSON.parse(raw) as ChatMessage[]
    chatHistory = arr || []
    chatHistory.forEach((m) => appendMessage(m.role, m.text, false))
  } catch {
    chatHistory = []
  }
}

// ---------- Status & avatar ----------

function setStatus(text: string) {
  statusEl.textContent = text
}

function setAvatarSpeaking(speaking: boolean) {
  if (speaking) avatarEl.classList.add("speaking")
  else avatarEl.classList.remove("speaking")
}

// ---------- Mic / push-to-talk ----------

async function startMic() {
  await connectWS()

  if (micEnabled) return

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    })
  } catch (e) {
    setStatus("Mic permission denied or unavailable")
    return
  }

  audioCtx = new AudioContext()
  const src = audioCtx.createMediaStreamSource(mediaStream)
  scriptNode = audioCtx.createScriptProcessor(2048, 1, 1)

  scriptNode.onaudioprocess = (ev: AudioProcessingEvent) => {
    if (!micEnabled || !ws || ws.readyState !== WebSocket.OPEN) return

    const input = ev.inputBuffer.getChannelData(0)
    // RMS for waveform
    let sumSq = 0
    for (let i = 0; i < input.length; i++) {
      sumSq += input[i] * input[i]
    }
    inputRms = Math.sqrt(sumSq / input.length)

    const down = downsampleTo24k(input, audioCtx!.sampleRate)
    const pcm = float32ToPcm16(down)
    const base64 = int16ToBase64(pcm)
    wsSend({ type: "audio", audio: base64 })
  }

  src.connect(scriptNode)
  scriptNode.connect(audioCtx.destination)

  micEnabled = true
  micButton.classList.remove("off")
  micButton.querySelector("span")!.textContent = "Release to stop"
  setStatus("Mic ON – speak")
}

function stopMic() {
  if (!micEnabled) return

  micEnabled = false
  wsSend({ type: "audio_end" })

  scriptNode?.disconnect()
  audioCtx?.close()
  mediaStream?.getTracks().forEach((t) => t.stop())

  scriptNode = null
  audioCtx = null
  mediaStream = null

  micButton.classList.add("off")
  micButton.querySelector("span")!.textContent = "Hold or click to talk"
  setStatus("Mic OFF")
}

// Push-to-talk behavior:
micButton.addEventListener("mousedown", (e: MouseEvent) => {
  e.preventDefault()
  startMic()
})
micButton.addEventListener("mouseup", (e: MouseEvent) => {
  e.preventDefault()
  stopMic()
})
micButton.addEventListener("mouseleave", () => {
  if (micEnabled) stopMic()
})
micButton.addEventListener("touchstart", (e: TouchEvent) => {
  e.preventDefault()
  startMic()
})
micButton.addEventListener("touchend", (e: TouchEvent) => {
  e.preventDefault()
  stopMic()
})
micButton.addEventListener("click", async (e: MouseEvent) => {
  e.preventDefault()
  if (!micEnabled) await startMic()
  else stopMic()
})

// ---------- Text input fallback ----------

sendButton.addEventListener("click", () => {
  sendTextMessage()
})

textInput.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    sendTextMessage()
  }
})

function sendTextMessage() {
  const text = textInput.value.trim()
  if (!text) return
  textInput.value = ""

  appendMessage("user", text, true)
  connectWS().then(() => {
    wsSend({ type: "text", text })
  })
}

// ---------- File upload (MP3/WAV) ----------

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0]
  if (!file) return

  await connectWS()
  setStatus("Processing audio file…")

  try {
    const arrayBuf = await file.arrayBuffer()
    const ctx = new AudioContext()
    const decoded = await ctx.decodeAudioData(arrayBuf)

    // mono
    const ch0 = decoded.getChannelData(0)
    const mono =
      decoded.numberOfChannels > 1 ? mixToMono(decoded) : new Float32Array(ch0)

    const targetRate = 24000
    const resampled = resampleBuffer(mono, decoded.sampleRate, targetRate)

    // chunk and send
    const chunkSize = 2048
    for (let i = 0; i < resampled.length; i += chunkSize) {
      const slice = resampled.subarray(i, i + chunkSize)
      const pcm = float32ToPcm16(slice)
      const base64 = int16ToBase64(pcm)
      wsSend({ type: "audio", audio: base64 })
    }
    wsSend({ type: "audio_end" })

    ctx.close()
    setStatus("File sent to assistant")
  } catch (e) {
    console.error(e)
    setStatus("Failed to process audio file")
  } finally {
    fileInput.value = ""
  }
})

function mixToMono(decoded: AudioBuffer): Float32Array {
  const length = decoded.length
  const output = new Float32Array(length)
  const channels = decoded.numberOfChannels
  for (let ch = 0; ch < channels; ch++) {
    const data = decoded.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      output[i] += data[i] / channels
    }
  }
  return output
}

function resampleBuffer(
  buffer: Float32Array,
  inRate: number,
  outRate: number
): Float32Array {
  if (inRate === outRate) return buffer
  const ratio = inRate / outRate
  const newLen = Math.round(buffer.length / ratio)
  const out = new Float32Array(newLen)
  for (let i = 0; i < newLen; i++) {
    const idx = i * ratio
    const idx0 = Math.floor(idx)
    const idx1 = Math.min(buffer.length - 1, idx0 + 1)
    const frac = idx - idx0
    out[i] = buffer[idx0] * (1 - frac) + buffer[idx1] * frac
  }
  return out
}

// ---------- Audio utils ----------

function downsampleTo24k(input: Float32Array, inRate: number): Float32Array {
  const outRate = 24000
  if (inRate === outRate) return input
  const ratio = inRate / outRate
  const newLen = Math.round(input.length / ratio)
  const out = new Float32Array(newLen)
  for (let i = 0; i < newLen; i++) {
    out[i] = input[Math.round(i * ratio)] || 0
  }
  return out
}

function float32ToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    let s = input[i]
    s = Math.max(-1, Math.min(1, s))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function int16ToBase64(input: Int16Array): string {
  const bytes = new Uint8Array(input.buffer)
  let bin = ""
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i])
  }
  return btoa(bin)
}

function base64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i)
  }
  const view = new DataView(bytes.buffer)
  const len = bytes.byteLength / 2
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = view.getInt16(i * 2, true) / 0x8000
  }
  return out
}

// ---------- Playback ----------

function queuePlayback(samples: Float32Array) {
  playQueue.push(samples)
  if (!isPlaying) playNext()
}

function playNext() {
  if (!playQueue.length) {
    isPlaying = false
    return
  }

  if (!playbackCtx) {
    playbackCtx = new AudioContext({ sampleRate: 24000 })
  }

  isPlaying = true
  setAvatarSpeaking(true)

  const samples = playQueue.shift()!
  const buf = playbackCtx.createBuffer(1, samples.length, 24000)
  buf.getChannelData(0).set(samples)

  const src = playbackCtx.createBufferSource()
  src.buffer = buf
  src.connect(playbackCtx.destination)
  src.start()

  src.onended = () => {
    if (playQueue.length === 0) {
      setAvatarSpeaking(false)
    }
    playNext()
  }
}

// ---------- Waveform ----------

function drawWave() {
  requestAnimationFrame(drawWave)

  const ctx = waveCanvas.getContext("2d")
  if (!ctx) return

  const rect = waveCanvas.getBoundingClientRect()
  waveCanvas.width = rect.width * devicePixelRatio
  waveCanvas.height = rect.height * devicePixelRatio
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

  const w = rect.width
  const h = rect.height
  ctx.clearRect(0, 0, w, h)

  const bars = 32
  const barWidth = w / bars
  const baseHeight = h * 0.1
  const level = Math.min(1, inputRms * 6)

  for (let i = 0; i < bars; i++) {
    const t = i / (bars - 1)
    const falloff = 1 - Math.abs(t - 0.5) * 2
    const height = baseHeight + level * falloff * h * 0.7
    const x = i * barWidth
    const y = (h - height) / 2

    ctx.fillStyle = "var(--accent)"
    ctx.fillRect(x + 2, y, barWidth - 4, height)
  }
}

// ---------- Boot ----------

loadHistory()
connectWS()
drawWave()
setStatus("Connecting…")

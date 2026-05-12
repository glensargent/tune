import { createSignal, onCleanup, Show } from 'solid-js'
import MicSelect from './MicSelect'
import Metronome from './Metronome'

interface RecorderProps {
  onRecorded: (blob: Blob, name: string) => void
}

export default function Recorder(props: RecorderProps) {
  const [recording, setRecording] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  const [level, setLevel] = createSignal(0)
  const [deviceId, setDeviceId] = createSignal<string | undefined>()

  let mediaRecorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let chunks: Blob[] = []
  let timer: ReturnType<typeof setInterval> | null = null
  let analyser: AnalyserNode | null = null
  let audioCtx: AudioContext | null = null
  let rafId: number | null = null

  function monitorLevel() {
    if (!analyser) return
    const data = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    setLevel(Math.sqrt(sum / data.length))
    rafId = requestAnimationFrame(monitorLevel)
  }

  async function start() {
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId() ? { deviceId: { exact: deviceId() } } : true,
      }
      stream = await navigator.mediaDevices.getUserMedia(constraints)
      mediaRecorder = new MediaRecorder(stream)
      chunks = []

      // Level monitoring
      audioCtx = new AudioContext()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 1024
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      monitorLevel()

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const name = `Recording ${new Date().toLocaleTimeString()}`
        props.onRecorded(blob, name)
      }

      mediaRecorder.start()
      setRecording(true)
      setElapsed(0)
      timer = setInterval(() => setElapsed(e => e + 1), 1000)
    } catch {
      // Mic permission denied
    }
  }

  function stop() {
    mediaRecorder?.stop()
    stream?.getTracks().forEach(t => t.stop())
    if (timer) clearInterval(timer)
    if (rafId) cancelAnimationFrame(rafId)
    audioCtx?.close()
    audioCtx = null
    analyser = null
    setRecording(false)
    setLevel(0)
  }

  onCleanup(() => {
    if (recording()) stop()
  })

  const formatElapsed = () => {
    const m = Math.floor(elapsed() / 60)
    const s = elapsed() % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div class="flex flex-col items-center gap-6">
      {/* Mic selector */}
      <div class="self-end">
        <MicSelect selectedId={deviceId()} onSelect={setDeviceId} />
      </div>

      {/* Level indicator */}
      <div class="relative w-48 h-48 flex items-center justify-center">
        <div
          class="absolute inset-0 rounded-full bg-accent/10 transition-transform duration-75"
          style={{ transform: `scale(${1 + level() * 2})` }}
        />
        <div
          class="absolute inset-4 rounded-full bg-accent/15 transition-transform duration-75"
          style={{ transform: `scale(${1 + level() * 1.5})` }}
        />
        <button
          onClick={() => recording() ? stop() : start()}
          class={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
            recording()
              ? 'bg-danger hover:bg-danger/80'
              : 'bg-accent hover:bg-accent-hover'
          }`}
        >
          <Show when={recording()} fallback={
            <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          }>
            <div class="w-6 h-6 rounded-sm bg-white" />
          </Show>
        </button>
      </div>

      <Show when={recording()}>
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-danger animate-pulse" />
          <span class="font-mono text-lg text-text">{formatElapsed()}</span>
        </div>
      </Show>

      <p class="text-text-muted text-sm">
        {recording() ? 'Recording... click to stop' : 'Click to start recording'}
      </p>

      {/* Metronome */}
      <div class="w-full border-t border-border pt-6 mt-2">
        <Metronome />
      </div>
    </div>
  )
}

import { createSignal, onCleanup, Show } from 'solid-js'
import { computeRms, normalizeWaveform } from '../lib/audio'
import { acquireMicStream, stopStream } from '../lib/devices'
import { createPersistedSignal } from '../lib/persist'
import DeviceSelect from './DeviceSelect'
import Metronome from './Metronome'

interface RecorderProps {
  onRecorded: (blob: Blob, name: string, waveform: number[], duration: number) => void
  onFileUpload: (e: Event) => void
}

const WAVEFORM_SAMPLE_INTERVAL = 50

const createLevelMonitor = (stream: MediaStream) => {
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  ctx.createMediaStreamSource(stream).connect(analyser)
  const data = new Uint8Array(analyser.fftSize)

  const readLevel = (): number => {
    analyser.getByteTimeDomainData(data)
    return computeRms(data)
  }

  const dispose = () => ctx.close()

  return { readLevel, dispose }
}

export default function Recorder(props: RecorderProps) {
  const [recording, setRecording] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  const [level, setLevel] = createSignal(0)
  const [deviceId, setDeviceId] = createPersistedSignal<string | undefined>('tune:input-device', undefined)
  const [outputId, setOutputId] = createPersistedSignal<string | undefined>('tune:output-device', undefined)
  const [mono, setMono] = createPersistedSignal('tune:mono', true)

  let stream: MediaStream | null = null
  let recordingCtx: AudioContext | null = null
  let mediaRecorder: MediaRecorder | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let rafId: number | null = null
  let monitor: ReturnType<typeof createLevelMonitor> | null = null
  let waveformSamples: number[] = []
  let lastSampleTime = 0
  let recordStartTime = 0

  const tick = () => {
    if (!monitor) return
    const rms = monitor.readLevel()
    setLevel(rms)

    const now = performance.now()
    if (now - lastSampleTime > WAVEFORM_SAMPLE_INTERVAL) {
      waveformSamples.push(rms)
      lastSampleTime = now
    }

    rafId = requestAnimationFrame(tick)
  }

  const start = async () => {
    try {
      stream = await acquireMicStream(deviceId())
      monitor = createLevelMonitor(stream)
      tick()

      // Route through Web Audio to force correct channel count.
      // getUserMedia's channelCount is just a hint — this guarantees it.
      const channels = mono() ? 1 : 2
      recordingCtx = new AudioContext()
      const source = recordingCtx.createMediaStreamSource(stream)
      const dest = recordingCtx.createMediaStreamDestination()
      dest.channelCount = channels
      dest.channelCountMode = 'explicit'
      source.connect(dest)

      mediaRecorder = new MediaRecorder(dest.stream)
      const chunks: Blob[] = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRecorder!.mimeType })
        const name = `Recording ${new Date().toLocaleTimeString()}`
        const dur = (performance.now() - recordStartTime) / 1000
        props.onRecorded(blob, name, normalizeWaveform(waveformSamples), dur)
      }

      waveformSamples = []
      lastSampleTime = 0
      recordStartTime = performance.now()
      mediaRecorder.start()
      setRecording(true)
      setElapsed(0)
      timer = setInterval(() => setElapsed(e => e + 1), 1000)
    } catch { /* mic permission denied */ }
  }

  const stop = () => {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = null
    mediaRecorder?.stop()
    stopStream(stream)
    stream = null
    recordingCtx?.close()
    recordingCtx = null
    if (timer) clearInterval(timer)
    timer = null
    monitor?.dispose()
    monitor = null
    setRecording(false)
    setLevel(0)
  }

  onCleanup(() => { if (recording()) stop() })

  const formatElapsed = () => {
    const m = Math.floor(elapsed() / 60)
    const s = elapsed() % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div class="flex flex-col items-center gap-6">
      <div class="self-end flex gap-2">
        <button
          onClick={() => setMono(!mono())}
          class={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
            mono() ? 'bg-surface-3 text-text-muted hover:text-text' : 'bg-accent text-white'
          }`}
        >
          {mono() ? 'Mono' : 'Stereo'}
        </button>
        <DeviceSelect kind="audioinput" selectedId={deviceId()} onSelect={setDeviceId} />
        <DeviceSelect kind="audiooutput" selectedId={outputId()} onSelect={setOutputId} />
      </div>

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
            recording() ? 'bg-danger hover:bg-danger/80' : 'bg-accent hover:bg-accent-hover'
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

      <div class="flex items-center gap-3">
        <p class="text-text-muted text-sm">
          {recording() ? 'Recording... click to stop' : 'Click to start recording'}
        </p>
        <Show when={!recording()}>
          <span class="text-text-muted text-sm">or</span>
          <label class="px-3 py-1.5 text-xs bg-surface-3 text-text-muted rounded-lg font-medium hover:text-text transition-colors cursor-pointer">
            Upload File
            <input type="file" accept="audio/*" class="hidden" onChange={props.onFileUpload} />
          </label>
        </Show>
      </div>

      <div class="w-full border-t border-border pt-6 mt-2">
        <Metronome outputDeviceId={outputId()} />
      </div>
    </div>
  )
}

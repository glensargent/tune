import { createSignal, onCleanup, Show } from 'solid-js'
import { computeRms, normalizeWaveform } from '../lib/audio'
import { acquireMicStream, stopStream } from '../lib/devices'
import { createPersistedSignal } from '../lib/persist'
import DeviceSelect from './DeviceSelect'
import Metronome from './Metronome'

interface RecorderProps {
  onRecorded: (blob: Blob, name: string, waveform: number[], duration: number, pcm: Float32Array, sampleRate: number) => void
  onFileUpload: (e: Event) => void
}

const WAVEFORM_SAMPLE_INTERVAL = 50

export default function Recorder(props: RecorderProps) {
  const [recording, setRecording] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  const [level, setLevel] = createSignal(0)
  const [deviceId, setDeviceId] = createPersistedSignal<string | undefined>('tune:input-device', undefined)
  const [outputId, setOutputId] = createPersistedSignal<string | undefined>('tune:output-device', undefined)
  const [mono, setMono] = createPersistedSignal('tune:mono', true)

  let stream: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let analyserData: Uint8Array<ArrayBuffer> | null = null
  let mediaRecorder: MediaRecorder | null = null
  let pcmCapture: ScriptProcessorNode | null = null
  let pcmChunks: Float32Array[] = []
  let recordingSampleRate = 44100
  let timer: ReturnType<typeof setInterval> | null = null
  let levelTimer: ReturnType<typeof setInterval> | null = null
  let waveformSamples: number[] = []
  let lastSampleTime = 0
  let recordStartTime = 0

  const tick = () => {
    if (!analyser || !analyserData) return
    analyser.getByteTimeDomainData(analyserData)
    const rms = computeRms(analyserData)
    setLevel(rms)

    const now = performance.now()
    if (now - lastSampleTime > WAVEFORM_SAMPLE_INTERVAL) {
      waveformSamples.push(rms)
      lastSampleTime = now
    }
  }

  const start = async () => {
    try {
      stream = await acquireMicStream(deviceId())

      // Single AudioContext for both level monitoring and channel routing
      const channels = mono() ? 1 : 2
      audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)

      // Analyser for level metering (tap off the source)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 1024
      analyserData = new Uint8Array(analyser.fftSize)
      source.connect(analyser)

      // Force correct channel count via destination
      const dest = audioCtx.createMediaStreamDestination()
      dest.channelCount = channels
      dest.channelCountMode = 'explicit'
      source.connect(dest)

      // Capture raw PCM for reliable encoding later
      pcmChunks = []
      recordingSampleRate = audioCtx.sampleRate
      pcmCapture = audioCtx.createScriptProcessor(4096, 1, 1)
      pcmCapture.onaudioprocess = e => {
        pcmChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }
      source.connect(pcmCapture)
      pcmCapture.connect(audioCtx.destination) // must be connected to work

      // iOS Safari suspends AudioContext — must resume after user gesture
      if (audioCtx.state === 'suspended') await audioCtx.resume()

      // Use setInterval instead of rAF — iOS throttles rAF during audio
      levelTimer = setInterval(tick, 50)

      mediaRecorder = new MediaRecorder(dest.stream)
      const chunks: Blob[] = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRecorder!.mimeType })
        const now = new Date()
        const name = `Recording ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
        const dur = (performance.now() - recordStartTime) / 1000

        // Merge PCM chunks into a single Float32Array
        const totalLength = pcmChunks.reduce((sum, c) => sum + c.length, 0)
        const pcm = new Float32Array(totalLength)
        let offset = 0
        for (const chunk of pcmChunks) {
          pcm.set(chunk, offset)
          offset += chunk.length
        }

        props.onRecorded(blob, name, normalizeWaveform(waveformSamples), dur, pcm, recordingSampleRate)
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
    if (levelTimer) clearInterval(levelTimer)
    levelTimer = null
    mediaRecorder?.stop()
    stopStream(stream)
    stream = null
    pcmCapture?.disconnect()
    pcmCapture = null
    audioCtx?.close()
    audioCtx = null
    analyser = null
    analyserData = null
    if (timer) clearInterval(timer)
    timer = null
    setRecording(false)
    setLevel(0)
  }

  onCleanup(() => { if (recording()) stop() })

  const formatElapsed = () => {
    const m = Math.floor(elapsed() / 60)
    const s = elapsed() % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Map RMS to a 0-1 range with a noise floor cutoff
  const breathe = () => {
    const raw = level()
    const clamped = Math.max(0, raw - 0.015) / 0.08
    return Math.min(clamped, 1)
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
        <Show when={recording()}>
          <div
            class="absolute rounded-full bg-danger/5 transition-[width,height] duration-200 ease-out"
            style={{
              width: `${192 + breathe() * 200}px`,
              height: `${192 + breathe() * 200}px`,
            }}
          />
          <div
            class="absolute rounded-full bg-danger/10 transition-[width,height] duration-150 ease-out"
            style={{
              width: `${160 + breathe() * 140}px`,
              height: `${160 + breathe() * 140}px`,
            }}
          />
          <div
            class="absolute rounded-full bg-danger/15 transition-[width,height] duration-100 ease-out"
            style={{
              width: `${120 + breathe() * 80}px`,
              height: `${120 + breathe() * 80}px`,
            }}
          />
        </Show>
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

import { createSignal, onCleanup } from 'solid-js'
import { detectPitch, smoothPitch, type PitchResult } from '../lib/pitch'
import { clamp } from '../lib/audio'
import { acquireMicStream, stopStream } from '../lib/devices'
import { createPersistedSignal } from '../lib/persist'
import DeviceSelect from './DeviceSelect'

const HOLD_MS = 800
const SMOOTH_WINDOW = 5
const GAUGE_TICKS = [-40, -30, -20, -10, 10, 20, 30, 40] as const

const centsToRotation = (cents: number): number =>
  clamp(-50, 50, cents) * 1.8

const centsToColor = (cents: number | undefined, isActive: boolean): string => {
  if (cents === undefined || !isActive) return 'text-text-muted'
  const abs = Math.abs(cents)
  if (abs <= 5) return 'text-success'
  if (abs <= 15) return 'text-warning'
  return 'text-danger'
}

const gaugeTickPosition = (cents: number) => {
  const angle = (cents * 1.8 - 90) * (Math.PI / 180)
  return {
    x1: 100 + 75 * Math.cos(angle),
    y1: 100 + 75 * Math.sin(angle),
    x2: 100 + 82 * Math.cos(angle),
    y2: 100 + 82 * Math.sin(angle),
  }
}

const needleEndpoint = (rotation: number) => ({
  x: 100 + 70 * Math.cos((rotation - 90) * Math.PI / 180),
  y: 100 + 70 * Math.sin((rotation - 90) * Math.PI / 180),
})

export default function Tuner() {
  const [listening, setListening] = createSignal(false)
  const [displayPitch, setDisplayPitch] = createSignal<PitchResult | null>(null)
  const [active, setActive] = createSignal(false)
  const [deviceId, setDeviceId] = createPersistedSignal<string | undefined>('tune:input-device', undefined)

  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let stream: MediaStream | null = null
  let rafId: number | null = null
  let holdTimeout: ReturnType<typeof setTimeout> | null = null
  let recentPitches: PitchResult[] = []

  const tick = () => {
    if (analyser && audioContext) {
      const result = detectPitch(analyser, audioContext.sampleRate)

      if (result) {
        recentPitches.push(result)
        if (recentPitches.length > SMOOTH_WINDOW) recentPitches.shift()

        setDisplayPitch(smoothPitch(recentPitches, result))
        setActive(true)

        if (holdTimeout) {
          clearTimeout(holdTimeout)
          holdTimeout = null
        }
      } else if (active() && !holdTimeout) {
        holdTimeout = setTimeout(() => {
          setActive(false)
          recentPitches = []
          holdTimeout = null
        }, HOLD_MS)
      }
    }
    rafId = requestAnimationFrame(tick)
  }

  const start = async () => {
    try {
      stream = await acquireMicStream(deviceId())
      audioContext = new AudioContext()
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 4096
      audioContext.createMediaStreamSource(stream).connect(analyser)
      setListening(true)
      recentPitches = []
      tick()
    } catch { /* mic permission denied */ }
  }

  const stop = () => {
    if (rafId) cancelAnimationFrame(rafId)
    if (holdTimeout) clearTimeout(holdTimeout)
    stopStream(stream)
    audioContext?.close()
    audioContext = null
    analyser = null
    stream = null
    rafId = null
    holdTimeout = null
    recentPitches = []
    setListening(false)
    setDisplayPitch(null)
    setActive(false)
  }

  onCleanup(stop)

  const rotation = () => centsToRotation(displayPitch()?.cents ?? 0)
  const color = () => centsToColor(displayPitch()?.cents, active())
  const needle = () => needleEndpoint(rotation())
  const noteDisplay = () => displayPitch()?.note ?? 'A'
  const octaveDisplay = () => displayPitch()?.octave ?? 4
  const freqDisplay = () => displayPitch()?.frequency.toFixed(1) ?? '440.0'
  const centsDisplay = () => {
    const p = displayPitch()
    return p ? `${p.cents > 0 ? '+' : ''}${p.cents}` : '0'
  }
  const hasDetected = () => displayPitch() !== null
  const dimmed = () => !active()

  return (
    <div class="flex flex-col items-center gap-6">
      <div class="self-end">
        <DeviceSelect kind="audioinput" selectedId={deviceId()} onSelect={setDeviceId} />
      </div>

      <div class="relative w-64 h-40 flex items-end justify-center">
        <svg viewBox="0 0 200 110" class="w-full h-full absolute inset-0">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="currentColor" stroke-width="2" class="text-border" />
          <line x1="100" y1="20" x2="100" y2="30" stroke="currentColor" stroke-width="2" class="text-success" />
          {GAUGE_TICKS.map(cents => {
            const pos = gaugeTickPosition(cents)
            return <line x1={pos.x1} y1={pos.y1} x2={pos.x2} y2={pos.y2} stroke="currentColor" stroke-width="1" class="text-text-muted" />
          })}
          <line
            x1="100" y1="100" x2={needle().x} y2={needle().y}
            stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            class={`${color()} transition-all duration-150`}
            style={{ transition: 'x2 150ms ease-out, y2 150ms ease-out' }}
          />
          <circle cx="100" cy="100" r="4" fill="currentColor" class={color()} />
        </svg>
      </div>

      <div class={`text-center transition-opacity duration-300 ${dimmed() && hasDetected() ? 'opacity-40' : dimmed() ? 'opacity-20' : 'opacity-100'}`}>
        <div>
          <span class={`text-6xl font-bold transition-colors duration-200 ${hasDetected() ? color() : 'text-text-muted'}`}>
            {noteDisplay()}
          </span>
          <span class="text-2xl text-text-muted ml-1">{octaveDisplay()}</span>
        </div>
        <p class="text-sm text-text-muted mt-1">
          {hasDetected()
            ? <>{freqDisplay()} Hz &middot; {centsDisplay()} cents</>
            : listening() ? 'Play a note...' : '440.0 Hz'
          }
        </p>
      </div>

      <button
        onClick={() => listening() ? stop() : start()}
        class={`px-6 py-3 rounded-xl font-medium transition-colors cursor-pointer ${
          listening() ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'bg-accent text-white hover:bg-accent-hover'
        }`}
      >
        {listening() ? 'Stop Tuner' : 'Start Tuner'}
      </button>
    </div>
  )
}

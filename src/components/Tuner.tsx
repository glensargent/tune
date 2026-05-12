import { createSignal, onCleanup } from 'solid-js'
import { detectPitch, type PitchResult } from '../lib/pitch'
import MicSelect from './MicSelect'

export default function Tuner() {
  const [listening, setListening] = createSignal(false)
  const [displayPitch, setDisplayPitch] = createSignal<PitchResult | null>(null)
  const [active, setActive] = createSignal(false) // whether we currently hear a note
  const [deviceId, setDeviceId] = createSignal<string | undefined>()

  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let stream: MediaStream | null = null
  let rafId: number | null = null

  // Smoothing: keep a small rolling window and hold the last note for a bit
  let holdTimeout: ReturnType<typeof setTimeout> | null = null
  let recentPitches: PitchResult[] = []
  const HOLD_MS = 800 // how long to keep showing after signal drops
  const SMOOTH_WINDOW = 5

  function tick() {
    if (analyser && audioContext) {
      const result = detectPitch(analyser, audioContext.sampleRate)

      if (result) {
        // Add to rolling window
        recentPitches.push(result)
        if (recentPitches.length > SMOOTH_WINDOW) recentPitches.shift()

        // Average the cents across the window for stability
        const avgCents = Math.round(
          recentPitches.reduce((sum, p) => sum + p.cents, 0) / recentPitches.length
        )
        // Use the most common note in the window
        const noteCounts = new Map<string, number>()
        for (const p of recentPitches) {
          const key = `${p.note}${p.octave}`
          noteCounts.set(key, (noteCounts.get(key) ?? 0) + 1)
        }
        let bestNote = result
        let bestCount = 0
        for (const p of recentPitches) {
          const key = `${p.note}${p.octave}`
          const count = noteCounts.get(key) ?? 0
          if (count > bestCount) {
            bestCount = count
            bestNote = p
          }
        }

        setDisplayPitch({
          ...bestNote,
          cents: avgCents,
        })
        setActive(true)

        // Clear any pending fade-out
        if (holdTimeout) {
          clearTimeout(holdTimeout)
          holdTimeout = null
        }
      } else {
        // No pitch detected — start hold timer instead of clearing immediately
        if (active() && !holdTimeout) {
          holdTimeout = setTimeout(() => {
            setActive(false)
            recentPitches = []
            holdTimeout = null
          }, HOLD_MS)
        }
      }
    }
    rafId = requestAnimationFrame(tick)
  }

  async function start() {
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId() ? { deviceId: { exact: deviceId() } } : true,
      }
      stream = await navigator.mediaDevices.getUserMedia(constraints)
      audioContext = new AudioContext()
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 4096
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      setListening(true)
      recentPitches = []
      tick()
    } catch {
      // Mic permission denied
    }
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId)
    if (holdTimeout) clearTimeout(holdTimeout)
    stream?.getTracks().forEach(t => t.stop())
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

  const centsRotation = () => {
    const p = displayPitch()
    if (!p) return 0
    return Math.max(-50, Math.min(50, p.cents)) * 1.8
  }

  const centsColor = () => {
    const p = displayPitch()
    if (!p || !active()) return 'text-text-muted'
    const absCents = Math.abs(p.cents)
    if (absCents <= 5) return 'text-success'
    if (absCents <= 15) return 'text-warning'
    return 'text-danger'
  }

  // Display values — always show something so layout doesn't jump
  const noteDisplay = () => displayPitch()?.note ?? 'A'
  const octaveDisplay = () => displayPitch()?.octave ?? 4
  const freqDisplay = () => displayPitch()?.frequency.toFixed(1) ?? '440.0'
  const centsDisplay = () => {
    const p = displayPitch()
    if (!p) return '0'
    return `${p.cents > 0 ? '+' : ''}${p.cents}`
  }
  const hasEverDetected = () => displayPitch() !== null
  const dimmed = () => !active()

  return (
    <div class="flex flex-col items-center gap-6">
      {/* Mic selector */}
      <div class="self-end">
        <MicSelect selectedId={deviceId()} onSelect={setDeviceId} />
      </div>

      {/* Tuner gauge */}
      <div class="relative w-64 h-40 flex items-end justify-center">
        <svg viewBox="0 0 200 110" class="w-full h-full absolute inset-0">
          {/* Gauge arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-border"
          />
          {/* Center tick (in tune) */}
          <line x1="100" y1="20" x2="100" y2="30" stroke="currentColor" stroke-width="2" class="text-success" />
          {/* Side ticks */}
          {[-40, -30, -20, -10, 10, 20, 30, 40].map(cents => {
            const angle = (cents * 1.8 - 90) * (Math.PI / 180)
            const r1 = 75, r2 = 82
            const x1 = 100 + r1 * Math.cos(angle)
            const y1 = 100 + r1 * Math.sin(angle)
            const x2 = 100 + r2 * Math.cos(angle)
            const y2 = 100 + r2 * Math.sin(angle)
            return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" stroke-width="1" class="text-text-muted" />
          })}
          {/* Needle */}
          <line
            x1="100"
            y1="100"
            x2={100 + 70 * Math.cos((centsRotation() - 90) * Math.PI / 180)}
            y2={100 + 70 * Math.sin((centsRotation() - 90) * Math.PI / 180)}
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            class={`${centsColor()} transition-all duration-150`}
            style={{
              transition: 'x2 150ms ease-out, y2 150ms ease-out',
            }}
          />
          <circle cx="100" cy="100" r="4" fill="currentColor" class={centsColor()} />
        </svg>
      </div>

      {/* Note display — always present, dims when inactive */}
      <div class={`text-center transition-opacity duration-300 ${dimmed() && hasEverDetected() ? 'opacity-40' : dimmed() ? 'opacity-20' : 'opacity-100'}`}>
        <div>
          <span class={`text-6xl font-bold transition-colors duration-200 ${hasEverDetected() ? centsColor() : 'text-text-muted'}`}>
            {noteDisplay()}
          </span>
          <span class="text-2xl text-text-muted ml-1">{octaveDisplay()}</span>
        </div>
        <p class="text-sm text-text-muted mt-1">
          {hasEverDetected()
            ? <>{freqDisplay()} Hz &middot; {centsDisplay()} cents</>
            : listening()
              ? 'Play a note...'
              : '440.0 Hz'
          }
        </p>
      </div>

      {/* Toggle button */}
      <button
        onClick={() => listening() ? stop() : start()}
        class={`px-6 py-3 rounded-xl font-medium transition-colors cursor-pointer ${
          listening()
            ? 'bg-danger/20 text-danger hover:bg-danger/30'
            : 'bg-accent text-white hover:bg-accent-hover'
        }`}
      >
        {listening() ? 'Stop Tuner' : 'Start Tuner'}
      </button>
    </div>
  )
}

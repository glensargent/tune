import { createSignal, onCleanup } from 'solid-js'

export default function Metronome() {
  const [bpm, setBpm] = createSignal(120)
  const [playing, setPlaying] = createSignal(false)
  const [beat, setBeat] = createSignal(0)
  const [beatsPerMeasure, setBeatsPerMeasure] = createSignal(4)

  let audioCtx: AudioContext | null = null
  let nextBeatTime = 0
  let currentBeat = 0
  let timerId: ReturnType<typeof setTimeout> | null = null

  function createClick(time: number, isDownbeat: boolean) {
    if (!audioCtx) return
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)

    osc.frequency.value = isDownbeat ? 1000 : 700
    gain.gain.setValueAtTime(0.5, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05)

    osc.start(time)
    osc.stop(time + 0.05)
  }

  function schedule() {
    if (!audioCtx) return
    // Schedule beats ahead by a small lookahead window
    while (nextBeatTime < audioCtx.currentTime + 0.1) {
      const isDownbeat = currentBeat % beatsPerMeasure() === 0
      createClick(nextBeatTime, isDownbeat)

      // Schedule UI update at the right time
      const beatNum = currentBeat % beatsPerMeasure()
      const delay = (nextBeatTime - audioCtx.currentTime) * 1000
      setTimeout(() => setBeat(beatNum), Math.max(0, delay))

      nextBeatTime += 60 / bpm()
      currentBeat++
    }
    timerId = setTimeout(schedule, 25)
  }

  function start() {
    audioCtx = new AudioContext()
    currentBeat = 0
    nextBeatTime = audioCtx.currentTime
    setPlaying(true)
    setBeat(0)
    schedule()
  }

  function stop() {
    if (timerId) clearTimeout(timerId)
    audioCtx?.close()
    audioCtx = null
    timerId = null
    setPlaying(false)
    setBeat(0)
    currentBeat = 0
  }

  function adjustBpm(delta: number) {
    setBpm(b => Math.max(20, Math.min(300, b + delta)))
  }

  function handleBpmInput(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value)
    if (!isNaN(val)) setBpm(Math.max(20, Math.min(300, val)))
  }

  onCleanup(() => {
    if (playing()) stop()
  })

  const timeSignatures = [2, 3, 4, 6, 8]

  return (
    <div class="flex flex-col items-center gap-8">
      {/* Beat visualization */}
      <div class="flex items-center gap-3">
        {Array.from({ length: beatsPerMeasure() }, (_, i) => (
          <div
            class={`w-5 h-5 rounded-full transition-all duration-75 ${
              playing() && beat() === i
                ? i === 0
                  ? 'bg-accent scale-125'
                  : 'bg-text scale-110'
                : 'bg-surface-3'
            }`}
          />
        ))}
      </div>

      {/* BPM display */}
      <div class="flex flex-col items-center gap-1">
        <div class="flex items-center gap-4">
          <button
            onClick={() => adjustBpm(-5)}
            class="w-10 h-10 rounded-xl bg-surface-3 text-text-muted hover:text-text hover:bg-border flex items-center justify-center transition-colors cursor-pointer text-lg font-bold"
          >
            -
          </button>
          <div class="flex items-baseline gap-1">
            <input
              type="number"
              value={bpm()}
              onInput={handleBpmInput}
              class="w-20 text-center text-5xl font-bold bg-transparent text-text outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              min="20"
              max="300"
            />
            <span class="text-sm text-text-muted">BPM</span>
          </div>
          <button
            onClick={() => adjustBpm(5)}
            class="w-10 h-10 rounded-xl bg-surface-3 text-text-muted hover:text-text hover:bg-border flex items-center justify-center transition-colors cursor-pointer text-lg font-bold"
          >
            +
          </button>
        </div>
      </div>

      {/* BPM slider */}
      <input
        type="range"
        min="20"
        max="300"
        value={bpm()}
        onInput={(e) => setBpm(parseInt(e.currentTarget.value))}
        class="w-full max-w-xs accent-accent"
      />

      {/* Time signature */}
      <div class="flex flex-col items-center gap-2">
        <span class="text-xs text-text-muted">Beats per measure</span>
        <div class="flex gap-1.5">
          {timeSignatures.map(n => (
            <button
              onClick={() => setBeatsPerMeasure(n)}
              class={`w-9 h-9 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                beatsPerMeasure() === n
                  ? 'bg-accent text-white'
                  : 'bg-surface-3 text-text-muted hover:text-text'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Play/stop */}
      <button
        onClick={() => playing() ? stop() : start()}
        class={`w-16 h-16 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
          playing()
            ? 'bg-danger hover:bg-danger/80'
            : 'bg-accent hover:bg-accent-hover'
        }`}
      >
        {playing() ? (
          <div class="w-5 h-5 rounded-sm bg-white" />
        ) : (
          <svg class="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Tempo presets */}
      <div class="flex flex-wrap justify-center gap-2">
        {[
          { label: 'Largo', bpm: 50 },
          { label: 'Adagio', bpm: 70 },
          { label: 'Andante', bpm: 92 },
          { label: 'Moderato', bpm: 108 },
          { label: 'Allegro', bpm: 132 },
          { label: 'Vivace', bpm: 160 },
          { label: 'Presto', bpm: 184 },
        ].map(p => (
          <button
            onClick={() => setBpm(p.bpm)}
            class={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
              bpm() === p.bpm
                ? 'bg-accent text-white'
                : 'bg-surface-3 text-text-muted hover:text-text'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

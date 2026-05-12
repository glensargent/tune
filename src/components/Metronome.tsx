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
    while (nextBeatTime < audioCtx.currentTime + 0.1) {
      const isDownbeat = currentBeat % beatsPerMeasure() === 0
      createClick(nextBeatTime, isDownbeat)

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

  function cycleMeter() {
    const options = [2, 3, 4, 6, 8]
    const idx = options.indexOf(beatsPerMeasure())
    setBeatsPerMeasure(options[(idx + 1) % options.length])
  }

  onCleanup(() => {
    if (playing()) stop()
  })

  return (
    <div class="flex items-center gap-3 px-3 py-2.5 bg-surface-2 rounded-xl">
      {/* Play/stop */}
      <button
        onClick={() => playing() ? stop() : start()}
        class={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
          playing()
            ? 'bg-danger hover:bg-danger/80'
            : 'bg-accent hover:bg-accent-hover'
        }`}
      >
        {playing() ? (
          <div class="w-2.5 h-2.5 rounded-sm bg-white" />
        ) : (
          <svg class="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Beat dots */}
      <div class="flex items-center gap-1.5">
        {Array.from({ length: beatsPerMeasure() }, (_, i) => (
          <div
            class={`w-2.5 h-2.5 rounded-full transition-all duration-75 ${
              playing() && beat() === i
                ? i === 0
                  ? 'bg-accent scale-125'
                  : 'bg-text scale-110'
                : 'bg-surface-3'
            }`}
          />
        ))}
      </div>

      {/* Meter button */}
      <button
        onClick={cycleMeter}
        class="text-xs text-text-muted hover:text-text bg-surface-3 px-2 py-1 rounded-md font-mono transition-colors cursor-pointer shrink-0"
        title="Beats per measure"
      >
        {beatsPerMeasure()}/4
      </button>

      {/* BPM control */}
      <div class="flex items-center gap-1 ml-auto">
        <button
          onClick={() => adjustBpm(-5)}
          class="w-6 h-6 rounded-md bg-surface-3 text-text-muted hover:text-text flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
        >
          -
        </button>
        <input
          type="number"
          value={bpm()}
          onInput={(e) => {
            const val = parseInt(e.currentTarget.value)
            if (!isNaN(val)) setBpm(Math.max(20, Math.min(300, val)))
          }}
          class="w-10 text-center text-sm font-bold bg-transparent text-text outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          min="20"
          max="300"
        />
        <button
          onClick={() => adjustBpm(5)}
          class="w-6 h-6 rounded-md bg-surface-3 text-text-muted hover:text-text flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
        >
          +
        </button>
        <span class="text-xs text-text-muted ml-0.5">bpm</span>
      </div>
    </div>
  )
}

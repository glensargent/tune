import { createSignal, createEffect, onCleanup, Show, on } from 'solid-js'
import { formatTime } from '../lib/audio'
import DeviceSelect from './DeviceSelect'

interface PlayerProps {
  audioUrl: string
  name: string
  initialSpeed?: number
  initialStart?: number
  initialEnd?: number
  onSegmentCut?: (start: number, end: number, speed: number) => void
}

export default function Player(props: PlayerProps) {
  const [playing, setPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [speed, setSpeed] = createSignal(props.initialSpeed ?? 1)
  const [selectionStart, setSelectionStart] = createSignal<number | null>(props.initialStart ?? null)
  const [selectionEnd, setSelectionEnd] = createSignal<number | null>(props.initialEnd ?? null)
  const [waveformData, setWaveformData] = createSignal<number[]>([])
  const [outputId, setOutputId] = createSignal<string | undefined>()

  let audio: HTMLAudioElement | null = null
  let rafId: number | null = null
  let waveformRef: HTMLDivElement | undefined

  function createAudio() {
    if (audio) {
      audio.pause()
      if (rafId) cancelAnimationFrame(rafId)
    }
    audio = new Audio(props.audioUrl)
    audio.playbackRate = speed()
    const oid = outputId()
    if (oid && 'setSinkId' in audio) {
      try { (audio as any).setSinkId(oid) } catch {}
    }
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio!.duration)
      if (props.initialStart != null) {
        audio!.currentTime = props.initialStart
      }
    })
    audio.addEventListener('ended', () => setPlaying(false))

    // Generate waveform by decoding audio
    fetch(props.audioUrl)
      .then(r => r.arrayBuffer())
      .then(buf => {
        const ctx = new AudioContext()
        return ctx.decodeAudioData(buf).then(decoded => {
          ctx.close()
          return decoded
        })
      })
      .then(decoded => {
        const raw = decoded.getChannelData(0)
        const bars = 150
        const blockSize = Math.floor(raw.length / bars)
        const data: number[] = []
        for (let i = 0; i < bars; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(raw[i * blockSize + j])
          }
          data.push(sum / blockSize)
        }
        const max = Math.max(...data)
        setWaveformData(data.map(v => v / max))
      })
      .catch(() => {})
  }

  createEffect(on(() => props.audioUrl, () => {
    createAudio()
  }))

  function updateTime() {
    if (audio) {
      setCurrentTime(audio.currentTime)
      const end = selectionEnd()
      if (end !== null && audio.currentTime >= end) {
        audio.currentTime = selectionStart() ?? 0
      }
    }
    if (playing()) {
      rafId = requestAnimationFrame(updateTime)
    }
  }

  function togglePlay() {
    if (!audio) return
    if (playing()) {
      audio.pause()
      if (rafId) cancelAnimationFrame(rafId)
      setPlaying(false)
    } else {
      // If there's a selection, start from the selection start
      const s = selectionStart()
      if (s !== null && selectionEnd() !== null) {
        audio.currentTime = s
        setCurrentTime(s)
      }
      audio.play()
      setPlaying(true)
      updateTime()
    }
  }

  // Drag threshold in pixels — below this it's a click (seek), above it's a drag (select)
  const DRAG_THRESHOLD = 5

  function handleWaveformMouseDown(e: MouseEvent) {
    if (!waveformRef || duration() === 0) return
    const rect = waveformRef.getBoundingClientRect()
    const startX = e.clientX
    const startPct = Math.max(0, Math.min(1, (startX - rect.left) / rect.width))
    const startTime = startPct * duration()
    let dragged = false

    const handleMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - startX)
      if (!dragged && dx > DRAG_THRESHOLD) {
        dragged = true
        setSelectionStart(startTime)
      }
      if (dragged) {
        const movePct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        setSelectionEnd(movePct * duration())
      }
    }

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)

      if (!dragged) {
        // It was a click — seek
        if (audio) {
          audio.currentTime = startTime
          setCurrentTime(startTime)
        }
      } else {
        // Normalize so start < end
        const s = selectionStart()
        const end = selectionEnd()
        if (s !== null && end !== null && end < s) {
          setSelectionStart(end)
          setSelectionEnd(s)
        }
        // Discard tiny accidental selections (< 0.2s)
        const finalStart = selectionStart()
        const finalEnd = selectionEnd()
        if (finalStart !== null && finalEnd !== null && finalEnd - finalStart < 0.2) {
          clearSelection()
          if (audio) {
            audio.currentTime = startTime
            setCurrentTime(startTime)
          }
        }
      }
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  function skipForward() {
    if (!audio) return
    audio.currentTime = Math.min(audio.currentTime + 5, duration())
    setCurrentTime(audio.currentTime)
  }

  function skipBackward() {
    if (!audio) return
    audio.currentTime = Math.max(audio.currentTime - 5, 0)
    setCurrentTime(audio.currentTime)
  }

  function changeSpeed(newSpeed: number) {
    setSpeed(newSpeed)
    if (audio) audio.playbackRate = newSpeed
  }

  createEffect(on(() => outputId(), (oid) => {
    if (audio && oid && 'setSinkId' in audio) {
      try { (audio as any).setSinkId(oid) } catch {}
    }
  }))

  function clearSelection() {
    setSelectionStart(null)
    setSelectionEnd(null)
  }

  function cutSelection() {
    const start = selectionStart()
    const end = selectionEnd()
    if (start !== null && end !== null && props.onSegmentCut) {
      props.onSegmentCut(start, end, speed())
    }
  }

  onCleanup(() => {
    audio?.pause()
    if (rafId) cancelAnimationFrame(rafId)
  })

  const selStartPct = () => {
    const s = selectionStart()
    return s !== null ? (s / duration()) * 100 : 0
  }
  const selEndPct = () => {
    const e = selectionEnd()
    return e !== null ? (e / duration()) * 100 : 0
  }

  const speedPresets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

  return (
    <div class="flex flex-col gap-4 w-full">
      {/* Header row */}
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-lg font-semibold text-text truncate">{props.name}</h3>
        <DeviceSelect kind="audiooutput" selectedId={outputId()} onSelect={setOutputId} />
      </div>

      {/* Waveform */}
      <div
        ref={waveformRef}
        onMouseDown={handleWaveformMouseDown}
        class="relative h-24 bg-surface-2 rounded-xl overflow-hidden cursor-crosshair select-none"
      >
        {/* Waveform bars */}
        <div class="absolute inset-0 flex items-center gap-px px-1">
          {waveformData().map((v, i) => {
            const pct = (i / waveformData().length) * 100
            const isPlayed = pct <= (currentTime() / duration()) * 100
            return (
              <div
                class={`flex-1 rounded-full transition-colors ${isPlayed ? 'bg-accent' : 'bg-border'}`}
                style={{ height: `${Math.max(4, v * 80)}%` }}
              />
            )
          })}
        </div>

        {/* Selection overlay */}
        <Show when={selectionStart() !== null && selectionEnd() !== null}>
          <div
            class="absolute top-0 bottom-0 bg-accent/20 border-x-2 border-accent"
            style={{
              left: `${Math.min(selStartPct(), selEndPct())}%`,
              width: `${Math.abs(selEndPct() - selStartPct())}%`,
            }}
          />
        </Show>

        {/* Playhead */}
        <div
          class="absolute top-0 bottom-0 w-0.5 bg-white/80"
          style={{ left: `${duration() > 0 ? (currentTime() / duration()) * 100 : 0}%` }}
        />
      </div>

      {/* Selection actions */}
      <Show when={selectionStart() !== null && selectionEnd() !== null}>
        <div class="flex items-center gap-3 p-3 bg-surface-2 rounded-xl -mt-2">
          <div class="flex-1 text-sm text-text-muted">
            <span class="text-text font-mono">{formatTime(selectionStart()!)}</span>
            {' - '}
            <span class="text-text font-mono">{formatTime(selectionEnd()!)}</span>
          </div>
          <button
            onClick={cutSelection}
            class="px-3 py-1.5 text-xs bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors cursor-pointer"
          >
            Share
          </button>
          <button
            onClick={clearSelection}
            class="px-3 py-1.5 text-xs bg-surface-3 text-text-muted rounded-lg font-medium hover:text-text transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      </Show>

      {/* Time display */}
      <div class="flex justify-between text-xs text-text-muted font-mono">
        <span>{formatTime(currentTime())}</span>
        <span>{formatTime(duration())}</span>
      </div>

      {/* Transport controls */}
      <div class="flex items-center justify-center gap-3">
        <button onClick={skipBackward} class="p-2 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text transition-colors cursor-pointer" title="Back 5s">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M12.066 11.2a1 1 0 010 1.6l-7.2 5.4A1 1 0 013.266 17.4V6.6a1 1 0 011.6-.8l7.2 5.4z" fill="currentColor" transform="scale(-1,1) translate(-24,0)" />
            <path d="M20.066 11.2a1 1 0 010 1.6l-7.2 5.4a1 1 0 01-1.6-.8V6.6a1 1 0 011.6-.8l7.2 5.4z" fill="currentColor" transform="scale(-1,1) translate(-24,0)" />
          </svg>
        </button>

        <button
          onClick={togglePlay}
          class="w-12 h-12 rounded-full bg-accent hover:bg-accent-hover flex items-center justify-center transition-colors cursor-pointer"
        >
          <Show when={playing()} fallback={
            <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          }>
            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          </Show>
        </button>

        <button onClick={skipForward} class="p-2 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text transition-colors cursor-pointer" title="Forward 5s">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24">
            <path d="M3.934 11.2a1 1 0 000 1.6l7.2 5.4a1 1 0 001.6-.8V6.6a1 1 0 00-1.6-.8l-7.2 5.4z" fill="currentColor" />
            <path d="M11.934 11.2a1 1 0 000 1.6l7.2 5.4a1 1 0 001.6-.8V6.6a1 1 0 00-1.6-.8l-7.2 5.4z" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Speed control */}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-text-muted">Speed</span>
          <span class="text-xs font-mono text-text">{speed()}x</span>
        </div>
        <div class="flex gap-1.5 flex-wrap">
          {speedPresets.map(s => (
            <button
              onClick={() => changeSpeed(s)}
              class={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                speed() === s
                  ? 'bg-accent text-white'
                  : 'bg-surface-3 text-text-muted hover:text-text'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}

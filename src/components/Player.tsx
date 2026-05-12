import { createSignal, createEffect, onCleanup, Show, For, on } from 'solid-js'
import { formatTime, decodeAudioBuffer, extractWaveformBars, setSinkId } from '../lib/audio'
import { encodeWav, encodeMp3, encodeWavFromPcm, encodeMp3FromPcm, audioBufferFromBlob } from '../lib/encode'
import { createPersistedSignal } from '../lib/persist'
import DeviceSelect from './DeviceSelect'

interface PlayerProps {
  audioUrl: string
  audioBlob: Blob
  name: string
  initialSpeed?: number
  initialStart?: number
  initialEnd?: number
  onSegmentCut?: (start: number, end: number, speed: number) => void
  onClose?: () => void
  precomputedWaveform?: number[]
  precomputedDuration?: number
  pcm?: Float32Array
  pcmSampleRate?: number
}

const DRAG_THRESHOLD = 5
const SKIP_SECONDS = 5
const WAVEFORM_BARS = 150
const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const
const MIN_SELECTION_DURATION = 0.2
const DOWNLOAD_FORMATS = ['mp3', 'wav', 'original'] as const
type DownloadFormat = typeof DOWNLOAD_FORMATS[number]

const pctOfDuration = (time: number, duration: number): number =>
  duration > 0 ? (time / duration) * 100 : 0

const pctFromMouseEvent = (e: MouseEvent, rect: DOMRect): number =>
  Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))

export default function Player(props: PlayerProps) {
  const [playing, setPlaying] = createSignal(false)
  const [currentTime, setCurrentTime] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  const [speed, setSpeed] = createSignal(props.initialSpeed ?? 1)
  const [selStart, setSelStart] = createSignal<number | null>(props.initialStart ?? null)
  const [selEnd, setSelEnd] = createSignal<number | null>(props.initialEnd ?? null)
  const [waveformData, setWaveformData] = createSignal<number[]>([])
  const [outputId, setOutputId] = createPersistedSignal<string | undefined>('tune:output-device', undefined)
  const [downloadFormat, setDownloadFormat] = createSignal<DownloadFormat>('mp3')
  const [downloading, setDownloading] = createSignal(false)

  let audio: HTMLAudioElement | null = null
  let rafId: number | null = null
  let waveformRef: HTMLDivElement | undefined

  const initAudio = async () => {
    if (audio) {
      audio.pause()
      if (rafId) cancelAnimationFrame(rafId)
    }

    audio = new Audio(props.audioUrl)
    audio.playbackRate = speed()
    await setSinkId(audio, outputId())

    if (props.precomputedDuration) setDuration(props.precomputedDuration)
    if (props.precomputedWaveform) setWaveformData(props.precomputedWaveform)

    audio.addEventListener('loadedmetadata', () => {
      if (isFinite(audio!.duration) && audio!.duration > 0) {
        setDuration(audio!.duration)
      } else if (!props.precomputedDuration) {
        audio!.currentTime = 1e10
      }
      if (props.initialStart != null) {
        audio!.currentTime = props.initialStart
      }
    })

    audio.addEventListener('durationchange', () => {
      if (isFinite(audio!.duration) && audio!.duration > 0) {
        setDuration(audio!.duration)
      }
    })

    audio.addEventListener('ended', () => setPlaying(false))

    if (!props.precomputedWaveform) {
      try {
        const decoded = await decodeAudioBuffer(props.audioUrl)
        if (!props.precomputedDuration) setDuration(decoded.duration)
        setWaveformData(extractWaveformBars(decoded.getChannelData(0), WAVEFORM_BARS))
      } catch { /* decode failed */ }
    }
  }

  createEffect(on(() => props.audioUrl, () => { initAudio() }))

  const updateTime = () => {
    if (audio) {
      setCurrentTime(audio.currentTime)
      const end = selEnd()
      if (end !== null && audio.currentTime >= end) {
        audio.currentTime = selStart() ?? 0
      }
    }
    if (playing()) rafId = requestAnimationFrame(updateTime)
  }

  const togglePlay = () => {
    if (!audio) return
    if (playing()) {
      audio.pause()
      if (rafId) cancelAnimationFrame(rafId)
      setPlaying(false)
    } else {
      const s = selStart()
      if (s !== null && selEnd() !== null) {
        audio.currentTime = s
        setCurrentTime(s)
      }
      audio.play()
      setPlaying(true)
      updateTime()
    }
  }

  const seekTo = (time: number) => {
    if (!audio) return
    audio.currentTime = time
    setCurrentTime(time)
  }

  const handleWaveformMouseDown = (e: MouseEvent) => {
    if (!waveformRef || duration() === 0) return
    const rect = waveformRef.getBoundingClientRect()
    const startX = e.clientX
    const startTime = pctFromMouseEvent(e, rect) * duration()
    let dragged = false

    const handleMove = (e: MouseEvent) => {
      if (!dragged && Math.abs(e.clientX - startX) > DRAG_THRESHOLD) {
        dragged = true
        setSelStart(startTime)
      }
      if (dragged) setSelEnd(pctFromMouseEvent(e, rect) * duration())
    }

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)

      if (!dragged) {
        seekTo(startTime)
        return
      }

      const s = selStart()
      const end = selEnd()
      if (s !== null && end !== null && end < s) {
        setSelStart(end)
        setSelEnd(s)
      }

      const finalStart = selStart()
      const finalEnd = selEnd()
      if (finalStart !== null && finalEnd !== null && finalEnd - finalStart < MIN_SELECTION_DURATION) {
        clearSelection()
        seekTo(startTime)
      }
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const skip = (delta: number) =>
    seekTo(Math.max(0, Math.min((audio?.currentTime ?? 0) + delta, duration())))

  const changeSpeed = (s: number) => {
    setSpeed(s)
    if (audio) audio.playbackRate = s
  }

  createEffect(on(() => outputId(), async oid => {
    if (audio) await setSinkId(audio, oid)
  }))

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const fmt = downloadFormat()
      let blob: Blob
      let ext: string

      if (fmt === 'original') {
        blob = props.audioBlob
        const mime = props.audioBlob.type
        ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'mp4' : 'audio'
      } else if (props.pcm && props.pcmSampleRate) {
        // Use captured PCM data (recordings) — avoids webm decode issues
        if (fmt === 'mp3') {
          blob = encodeMp3FromPcm(props.pcm, props.pcmSampleRate)
          ext = 'mp3'
        } else {
          blob = new Blob([encodeWavFromPcm(props.pcm, props.pcmSampleRate)], { type: 'audio/wav' })
          ext = 'wav'
        }
      } else {
        // Uploaded files — decode normally
        const decoded = await audioBufferFromBlob(props.audioBlob)
        if (fmt === 'mp3') {
          blob = encodeMp3(decoded)
          ext = 'mp3'
        } else {
          blob = new Blob([encodeWav(decoded)], { type: 'audio/wav' })
          ext = 'wav'
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${props.name.replace(/\.[^.]+$/, '')}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      console.error('Download failed:', e)
    }
    setDownloading(false)
  }

  const clearSelection = () => { setSelStart(null); setSelEnd(null) }

  const cutSelection = () => {
    const s = selStart()
    const e = selEnd()
    if (s !== null && e !== null) props.onSegmentCut?.(s, e, speed())
  }

  onCleanup(() => {
    audio?.pause()
    if (rafId) cancelAnimationFrame(rafId)
  })

  const selStartPct = () => pctOfDuration(selStart() ?? 0, duration())
  const selEndPct = () => pctOfDuration(selEnd() ?? 0, duration())
  const playheadPct = () => pctOfDuration(currentTime(), duration())
  const hasSelection = () => selStart() !== null && selEnd() !== null

  return (
    <div class="flex flex-col gap-4 w-full">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-lg font-semibold text-text truncate">{props.name}</h3>
        <div class="flex items-center gap-2 shrink-0">
          <DeviceSelect kind="audiooutput" selectedId={outputId()} onSelect={setOutputId} />
          <Show when={props.onClose}>
            <button
              onClick={props.onClose}
              class="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-danger transition-colors cursor-pointer"
              title="Close"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </Show>
        </div>
      </div>

      <div
        ref={waveformRef}
        onMouseDown={handleWaveformMouseDown}
        class="relative h-24 bg-surface-2 rounded-xl overflow-hidden cursor-crosshair select-none"
      >
        <div class="absolute inset-0 flex items-center gap-px px-1">
          {waveformData().map((v, i) => (
            <div
              class={`flex-1 rounded-full transition-colors ${
                pctOfDuration(i, waveformData().length) <= playheadPct() ? 'bg-accent' : 'bg-border'
              }`}
              style={{ height: `${Math.max(4, v * 80)}%` }}
            />
          ))}
        </div>

        <Show when={hasSelection()}>
          <div
            class="absolute top-0 bottom-0 bg-accent/20 border-x-2 border-accent"
            style={{
              left: `${Math.min(selStartPct(), selEndPct())}%`,
              width: `${Math.abs(selEndPct() - selStartPct())}%`,
            }}
          />
        </Show>

        <div
          class="absolute top-0 bottom-0 w-0.5 bg-white/80"
          style={{ left: `${playheadPct()}%` }}
        />
      </div>

      <Show when={hasSelection()}>
        <div class="flex items-center gap-3 p-3 bg-surface-2 rounded-xl -mt-2">
          <div class="flex-1 text-sm text-text-muted">
            <span class="text-text font-mono">{formatTime(selStart()!)}</span>
            {' - '}
            <span class="text-text font-mono">{formatTime(selEnd()!)}</span>
          </div>
          <button onClick={cutSelection} class="px-3 py-1.5 text-xs bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors cursor-pointer">
            Share
          </button>
          <button onClick={clearSelection} class="px-3 py-1.5 text-xs bg-surface-3 text-text-muted rounded-lg font-medium hover:text-text transition-colors cursor-pointer">
            Clear
          </button>
        </div>
      </Show>

      <div class="flex justify-between text-xs text-text-muted font-mono">
        <span>{formatTime(currentTime())}</span>
        <span>{formatTime(duration())}</span>
      </div>

      <div class="flex items-center justify-center gap-3">
        <button onClick={() => skip(-SKIP_SECONDS)} class="p-2 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text transition-colors cursor-pointer" title="Back 5s">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M12.066 11.2a1 1 0 010 1.6l-7.2 5.4A1 1 0 013.266 17.4V6.6a1 1 0 011.6-.8l7.2 5.4z" fill="currentColor" transform="scale(-1,1) translate(-24,0)" />
            <path d="M20.066 11.2a1 1 0 010 1.6l-7.2 5.4a1 1 0 01-1.6-.8V6.6a1 1 0 011.6-.8l7.2 5.4z" fill="currentColor" transform="scale(-1,1) translate(-24,0)" />
          </svg>
        </button>

        <button onClick={togglePlay} class="w-12 h-12 rounded-full bg-accent hover:bg-accent-hover flex items-center justify-center transition-colors cursor-pointer">
          <Show when={playing()} fallback={
            <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          }>
            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
          </Show>
        </button>

        <button onClick={() => skip(SKIP_SECONDS)} class="p-2 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text transition-colors cursor-pointer" title="Forward 5s">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M12.066 11.2a1 1 0 010 1.6l-7.2 5.4A1 1 0 013.266 17.4V6.6a1 1 0 011.6-.8l7.2 5.4z" fill="currentColor" />
            <path d="M20.066 11.2a1 1 0 010 1.6l-7.2 5.4a1 1 0 01-1.6-.8V6.6a1 1 0 011.6-.8l7.2 5.4z" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Download */}
      <div class="flex items-center justify-center gap-2">
        <div class="flex gap-1">
          <For each={DOWNLOAD_FORMATS}>
            {fmt => (
              <button
                onClick={() => setDownloadFormat(fmt)}
                class={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                  downloadFormat() === fmt ? 'bg-accent text-white' : 'bg-surface-3 text-text-muted hover:text-text'
                }`}
              >
                {fmt === 'original' ? 'Original' : fmt.toUpperCase()}
              </button>
            )}
          </For>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading()}
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-3 text-text-muted rounded-lg font-medium hover:text-text transition-colors cursor-pointer disabled:opacity-50"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          {downloading() ? 'Converting...' : 'Download'}
        </button>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-xs text-text-muted">Speed</span>
        <div class="flex gap-1.5 flex-wrap">
          {SPEED_PRESETS.map(s => (
            <button
              onClick={() => changeSpeed(s)}
              class={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                speed() === s ? 'bg-accent text-white' : 'bg-surface-3 text-text-muted hover:text-text'
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

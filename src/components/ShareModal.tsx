import { createSignal } from 'solid-js'
import { encodeShareConfig } from '../lib/audio'

interface ShareModalProps {
  start: number
  end: number
  speed: number
  audioBlob: Blob
  onClose: () => void
}

export default function ShareModal(props: ShareModalProps) {
  const [copied, setCopied] = createSignal(false)
  const [downloading, setDownloading] = createSignal(false)

  const shareConfig = () => encodeShareConfig({
    speed: props.speed,
    startTime: props.start,
    endTime: props.end,
  })

  const shareUrl = () => {
    const base = window.location.origin + window.location.pathname
    return `${base}#config=${shareConfig()}`
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  async function downloadSegment() {
    setDownloading(true)
    try {
      // For client-side, we can offer the full audio with config in filename
      // True segment cutting would need server-side or OfflineAudioContext
      const ctx = new AudioContext()
      const arrayBuffer = await props.audioBlob.arrayBuffer()
      const decoded = await ctx.decodeAudioData(arrayBuffer)

      const startSample = Math.floor(props.start * decoded.sampleRate)
      const endSample = Math.floor(props.end * decoded.sampleRate)
      const length = endSample - startSample

      const offlineCtx = new OfflineAudioContext(
        decoded.numberOfChannels,
        length,
        decoded.sampleRate,
      )

      const source = offlineCtx.createBufferSource()
      source.buffer = decoded
      source.connect(offlineCtx.destination)
      source.start(0, props.start, props.end - props.start)

      const rendered = await offlineCtx.startRendering()
      ctx.close()

      // Encode as WAV
      const wav = encodeWAV(rendered)
      const blob = new Blob([wav], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `segment_${Math.floor(props.start)}s-${Math.floor(props.end)}s_${props.speed}x.wav`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Fallback: download full file
    }
    setDownloading(false)
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={props.onClose}>
      <div class="bg-surface-2 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-text">Share Segment</h3>
          <button onClick={props.onClose} class="p-1 rounded-lg hover:bg-surface-3 text-text-muted cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-3 mb-5">
          <div class="flex justify-between text-sm">
            <span class="text-text-muted">Time range</span>
            <span class="font-mono text-text">{Math.floor(props.start / 60)}:{(Math.floor(props.start) % 60).toString().padStart(2, '0')} - {Math.floor(props.end / 60)}:{(Math.floor(props.end) % 60).toString().padStart(2, '0')}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-text-muted">Playback speed</span>
            <span class="font-mono text-text">{props.speed}x</span>
          </div>
        </div>

        <div class="mb-4">
          <label class="text-xs text-text-muted block mb-1.5">Share link (config only — audio requires file)</label>
          <div class="flex gap-2">
            <input
              type="text"
              readonly
              value={shareUrl()}
              class="flex-1 bg-surface-3 text-text text-xs font-mono px-3 py-2 rounded-lg border border-border outline-none"
            />
            <button
              onClick={copyLink}
              class="px-3 py-2 bg-accent text-white text-xs rounded-lg font-medium hover:bg-accent-hover transition-colors cursor-pointer shrink-0"
            >
              {copied() ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <button
          onClick={downloadSegment}
          disabled={downloading()}
          class="w-full py-2.5 bg-surface-3 text-text rounded-xl font-medium hover:bg-border transition-colors cursor-pointer disabled:opacity-50"
        >
          {downloading() ? 'Processing...' : 'Download Segment as WAV'}
        </button>

        <p class="text-xs text-text-muted mt-3 text-center">
          Full sharing with audio requires a server. For now, download the segment or share the config link.
        </p>
      </div>
    </div>
  )
}

function encodeWAV(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const dataLength = buffer.length * blockAlign
  const headerLength = 44
  const totalLength = headerLength + dataLength

  const arrayBuffer = new ArrayBuffer(totalLength)
  const view = new DataView(arrayBuffer)

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, totalLength - 8, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  // Interleave channels
  let offset = 44
  const channels: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch))
  }
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]))
      view.setInt16(offset, sample * 0x7fff, true)
      offset += bytesPerSample
    }
  }

  return arrayBuffer
}

import { formatTime } from '../lib/audio'

interface ShareModalProps {
  start: number
  end: number
  speed: number
  onClose: () => void
}

export default function ShareModal(props: ShareModalProps) {
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={props.onClose}>
      <div class="bg-surface-2 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-text">Share Segment</h3>
          <button onClick={props.onClose} class="p-1 rounded-lg hover:bg-surface-3 text-text-muted cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-3 mb-6">
          <div class="flex justify-between text-sm">
            <span class="text-text-muted">Time range</span>
            <span class="font-mono text-text">{formatTime(props.start)} - {formatTime(props.end)}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-text-muted">Playback speed</span>
            <span class="font-mono text-text">{props.speed}x</span>
          </div>
        </div>

        <div class="flex flex-col items-center gap-3 py-6 border border-border border-dashed rounded-xl">
          <svg class="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0-12.814a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0 12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
          <p class="text-sm font-medium text-text">Coming soon</p>
          <p class="text-xs text-text-muted text-center px-4">
            Sharing segments with audio and playback config will be available once we add server support.
          </p>
        </div>
      </div>
    </div>
  )
}

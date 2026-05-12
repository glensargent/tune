import { createSignal, Show, For } from 'solid-js'
import { parseHashConfig } from './lib/audio'
import Tuner from './components/Tuner'
import Recorder from './components/Recorder'
import Player from './components/Player'
import ShareModal from './components/ShareModal'

type Tab = 'tuner' | 'studio'

interface AudioTrack {
  url: string
  blob: Blob
  name: string
  recordedWaveform?: number[]
  recordedDuration?: number
}

const TABS: readonly { id: Tab; label: string; icon: string }[] = [
  { id: 'studio', label: 'Studio', icon: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z' },
  { id: 'tuner', label: 'Tuner', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z' },
] as const

const hashConfig = parseHashConfig()

const createTrack = (blob: Blob, name: string, waveform?: number[], duration?: number): AudioTrack => ({
  url: URL.createObjectURL(blob),
  blob,
  name,
  recordedWaveform: waveform,
  recordedDuration: duration,
})

export default function App() {
  const [tab, setTab] = createSignal<Tab>('studio')
  const [tracks, setTracks] = createSignal<AudioTrack[]>([])
  const [activeTrack, setActiveTrack] = createSignal<AudioTrack | null>(null)
  const [shareData, setShareData] = createSignal<{ start: number; end: number; speed: number } | null>(null)

  const addTrack = (track: AudioTrack) => {
    setTracks(prev => [...prev, track])
    setActiveTrack(track)
  }

  const handleFileUpload = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    addTrack(createTrack(file, file.name))
    input.value = ''
  }

  const handleRecorded = (blob: Blob, name: string, waveform?: number[], duration?: number) =>
    addTrack(createTrack(blob, name, waveform, duration))

  const handleSegmentCut = (start: number, end: number, speed: number) =>
    setShareData({ start, end, speed })

  const selectTrack = (track: AudioTrack) => setActiveTrack(track)

  const removeTrack = (track: AudioTrack, e?: Event) => {
    e?.stopPropagation()
    URL.revokeObjectURL(track.url)
    const remaining = tracks().filter(t => t !== track)
    setTracks(remaining)
    if (activeTrack() === track) {
      setActiveTrack(remaining.length > 0 ? remaining[0] : null)
    }
  }

  const closeActiveTrack = () => {
    const track = activeTrack()
    if (track) removeTrack(track)
  }

  return (
    <div class="min-h-screen bg-surface text-text flex flex-col">
      <header class="border-b border-border bg-surface-2/50 backdrop-blur-sm sticky top-0 z-40">
        <div class="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
              </svg>
            </div>
            <h1 class="text-lg font-bold tracking-tight">tune</h1>
          </div>
        </div>
      </header>

      <nav class="border-b border-border bg-surface">
        <div class="max-w-3xl mx-auto px-4 flex gap-1">
          <For each={TABS}>
            {t => (
              <button
                onClick={() => setTab(t.id)}
                class={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  tab() === t.id ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text'
                }`}
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            )}
          </For>
        </div>
      </nav>

      <main class="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <Show when={tab() === 'tuner'}><Tuner /></Show>

        <Show when={tab() === 'studio'}>
          <div class="flex flex-col gap-8">
            <Show when={activeTrack()} fallback={
              <Recorder onRecorded={handleRecorded} onFileUpload={handleFileUpload} />
            }>
              {track => (
                <Player
                  audioUrl={track().url}
                  name={track().name}
                  initialSpeed={hashConfig?.speed}
                  initialStart={hashConfig?.startTime}
                  initialEnd={hashConfig?.endTime}
                  onSegmentCut={handleSegmentCut}
                  onClose={closeActiveTrack}
                  precomputedWaveform={track().recordedWaveform}
                  precomputedDuration={track().recordedDuration}
                />
              )}
            </Show>

            <Show when={tracks().length > 1}>
              <div class="border-t border-border pt-6">
                <h3 class="text-sm font-medium text-text-muted mb-3">Library</h3>
                <div class="space-y-1.5">
                  <For each={tracks()}>
                    {track => (
                      <div
                        onClick={() => selectTrack(track)}
                        class={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                          activeTrack() === track ? 'bg-accent-dim' : 'hover:bg-surface-2'
                        }`}
                      >
                        <div class={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          activeTrack() === track ? 'bg-accent' : 'bg-surface-3'
                        }`}>
                          <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 18V5l12 7-12 6z" />
                          </svg>
                        </div>
                        <span class="text-sm truncate flex-1">{track.name}</span>
                        <button
                          onClick={e => removeTrack(track, e)}
                          class="p-1 rounded hover:bg-surface-3 text-text-muted hover:text-danger transition-colors cursor-pointer shrink-0"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </main>

      <Show when={shareData()}>
        {data => (
          <ShareModal
            start={data().start}
            end={data().end}
            speed={data().speed}
            onClose={() => setShareData(null)}
          />
        )}
      </Show>
    </div>
  )
}

import { createSignal, createResource, For, Show } from 'solid-js'

interface MicSelectProps {
  selectedId: string | undefined
  onSelect: (deviceId: string) => void
}

async function getAudioDevices(): Promise<MediaDeviceInfo[]> {
  // Need a brief getUserMedia call to trigger permission prompt,
  // otherwise enumerateDevices returns empty labels
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(t => t.stop())
  } catch {
    return []
  }
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter(d => d.kind === 'audioinput')
}

export default function MicSelect(props: MicSelectProps) {
  const [open, setOpen] = createSignal(false)
  const [devices] = createResource(getAudioDevices)

  const selectedLabel = () => {
    const devs = devices()
    if (!devs) return 'Default'
    const found = devs.find(d => d.deviceId === props.selectedId)
    return found ? found.label || `Mic ${devs.indexOf(found) + 1}` : 'Default'
  }

  return (
    <div class="relative">
      <button
        onClick={() => setOpen(!open())}
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-3 text-text-muted rounded-lg font-medium hover:text-text transition-colors cursor-pointer"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
        <span class="truncate max-w-32">{selectedLabel()}</span>
        <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <Show when={open()}>
        <div class="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div class="absolute right-0 top-full mt-1 z-50 w-64 bg-surface-2 border border-border rounded-xl shadow-lg overflow-hidden">
          <Show when={devices.loading}>
            <div class="px-3 py-2 text-xs text-text-muted">Loading devices...</div>
          </Show>
          <Show when={devices()}>
            {(devs) => (
              <For each={devs()} fallback={
                <div class="px-3 py-2 text-xs text-text-muted">No microphones found</div>
              }>
                {(device, i) => (
                  <button
                    onClick={() => { props.onSelect(device.deviceId); setOpen(false) }}
                    class={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer flex items-center gap-2 ${
                      props.selectedId === device.deviceId
                        ? 'bg-accent-dim text-accent'
                        : 'text-text hover:bg-surface-3'
                    }`}
                  >
                    <Show when={props.selectedId === device.deviceId}>
                      <svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    </Show>
                    <span class="truncate">{device.label || `Microphone ${i() + 1}`}</span>
                  </button>
                )}
              </For>
            )}
          </Show>
        </div>
      </Show>
    </div>
  )
}

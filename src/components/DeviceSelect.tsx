import { createSignal, createResource, For, Show } from 'solid-js'

interface DeviceSelectProps {
  kind: 'audioinput' | 'audiooutput'
  selectedId: string | undefined
  onSelect: (deviceId: string) => void
}

async function getDevices(kind: string): Promise<MediaDeviceInfo[]> {
  // First try without getUserMedia — if permission was already granted,
  // labels will be populated and we avoid grabbing/releasing the mic
  let devices = await navigator.mediaDevices.enumerateDevices()
  const hasLabels = devices.some(d => d.kind === kind && d.label)

  if (!hasLabels) {
    // Need a brief getUserMedia to trigger the permission prompt
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
    } catch {
      return []
    }
    devices = await navigator.mediaDevices.enumerateDevices()
  }

  return devices.filter(d => d.kind === kind)
}

const micIcon = (
  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
)

const speakerIcon = (
  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
  </svg>
)

export default function DeviceSelect(props: DeviceSelectProps) {
  const [open, setOpen] = createSignal(false)
  // Only fetch devices when the dropdown is first opened, not on mount
  const [shouldFetch, setShouldFetch] = createSignal(false)
  const [devices] = createResource(() => shouldFetch() ? props.kind : false, (kind) => {
    if (kind === false) return Promise.resolve([] as MediaDeviceInfo[])
    return getDevices(kind)
  })

  const isInput = () => props.kind === 'audioinput'
  const fallbackLabel = () => isInput() ? 'Microphone' : 'Speaker'

  const selectedLabel = () => {
    const devs = devices()
    if (!devs) return 'Default'
    const found = devs.find(d => d.deviceId === props.selectedId)
    return found ? found.label || `${fallbackLabel()} ${devs.indexOf(found) + 1}` : 'Default'
  }

  return (
    <div class="relative">
      <button
        onClick={() => { setShouldFetch(true); setOpen(!open()) }}
        class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-3 text-text-muted rounded-lg font-medium hover:text-text transition-colors cursor-pointer"
      >
        {isInput() ? micIcon : speakerIcon}
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
                <div class="px-3 py-2 text-xs text-text-muted">No {isInput() ? 'microphones' : 'output devices'} found</div>
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
                    <span class="truncate">{device.label || `${fallbackLabel()} ${i() + 1}`}</span>
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

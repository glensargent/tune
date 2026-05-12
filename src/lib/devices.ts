export const enumerateDevices = async (kind: 'audioinput' | 'audiooutput'): Promise<MediaDeviceInfo[]> => {
  let devices = await navigator.mediaDevices.enumerateDevices()
  const hasLabels = devices.some(d => d.kind === kind && d.label)

  if (!hasLabels) {
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

export const findDevice = (devices: MediaDeviceInfo[], deviceId: string | undefined): MediaDeviceInfo | undefined =>
  devices.find(d => d.deviceId === deviceId)

export const deviceLabel = (
  devices: MediaDeviceInfo[],
  deviceId: string | undefined,
  fallback: string,
): string => {
  if (!deviceId) return 'Default'
  const device = findDevice(devices, deviceId)
  if (!device) return 'Default'
  return device.label || `${fallback} ${devices.indexOf(device) + 1}`
}

export const buildAudioConstraints = (
  deviceId: string | undefined,
  channelCount: number,
): MediaStreamConstraints => ({
  audio: {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    channelCount,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
})

export const acquireMicStream = async (
  deviceId: string | undefined,
  channelCount: number = 1,
): Promise<MediaStream> =>
  navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId, channelCount))

export const stopStream = (stream: MediaStream | null) =>
  stream?.getTracks().forEach(t => t.stop())

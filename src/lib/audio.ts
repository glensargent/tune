export const clamp = (min: number, max: number, value: number): number =>
  Math.max(min, Math.min(max, value))

export const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const computeRms = (data: Uint8Array): number => {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / data.length)
}

export const normalizeWaveform = (samples: number[]): number[] => {
  const max = Math.max(...samples, 0.001)
  return samples.map(v => v / max)
}

export const extractWaveformBars = (channelData: Float32Array, barCount: number): number[] => {
  const blockSize = Math.floor(channelData.length / barCount)
  const bars: number[] = []
  for (let i = 0; i < barCount; i++) {
    let sum = 0
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(channelData[i * blockSize + j])
    }
    bars.push(sum / blockSize)
  }
  return normalizeWaveform(bars)
}

export const decodeAudioBuffer = async (url: string): Promise<AudioBuffer> => {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(arrayBuffer)
  await ctx.close()
  return decoded
}

export const decodeShareConfig = (hash: string): {
  speed: number
  startTime: number
  endTime: number
} | null => {
  try {
    return JSON.parse(atob(hash))
  } catch {
    return null
  }
}

export const parseHashConfig = () => {
  const hash = window.location.hash
  return hash.startsWith('#config=')
    ? decodeShareConfig(hash.slice(8))
    : null
}

export const setSinkId = async (target: AudioContext | HTMLAudioElement, deviceId: string | undefined) => {
  if (deviceId && 'setSinkId' in target) {
    try {
      await (target as any).setSinkId(deviceId)
    } catch { /* unsupported */ }
  }
}

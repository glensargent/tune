export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function createAudioBuffer(audioContext: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  return audioContext.decodeAudioData(arrayBuffer)
}

export function decodeShareConfig(hash: string): {
  speed: number
  startTime: number
  endTime: number
} | null {
  try {
    return JSON.parse(atob(hash))
  } catch {
    return null
  }
}

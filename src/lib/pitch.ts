const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export interface PitchResult {
  frequency: number
  note: string
  octave: number
  cents: number
}

export function detectPitch(analyser: AnalyserNode, sampleRate: number): PitchResult | null {
  const buffer = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(buffer)

  // Check if there's enough signal
  let rms = 0
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i]
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.01) return null

  // Autocorrelation pitch detection
  const size = buffer.length
  const correlation = new Float32Array(size)
  for (let lag = 0; lag < size; lag++) {
    let sum = 0
    for (let i = 0; i < size - lag; i++) {
      sum += buffer[i] * buffer[i + lag]
    }
    correlation[lag] = sum
  }

  // Find the first peak after the initial decline
  let foundPeak = false
  let peakLag = 0
  let peakVal = 0

  const minLag = Math.floor(sampleRate / 1200) // ~1200Hz max
  const maxLag = Math.floor(sampleRate / 50)    // ~50Hz min

  for (let lag = minLag; lag < Math.min(maxLag, size); lag++) {
    if (correlation[lag] > correlation[lag - 1] && correlation[lag] > correlation[lag + 1]) {
      if (correlation[lag] > peakVal) {
        peakVal = correlation[lag]
        peakLag = lag
        foundPeak = true
      }
    }
  }

  if (!foundPeak || peakLag === 0) return null

  // Parabolic interpolation for better accuracy
  const prev = correlation[peakLag - 1]
  const curr = correlation[peakLag]
  const next = correlation[peakLag + 1]
  const shift = (prev - next) / (2 * (prev - 2 * curr + next))
  const refinedLag = peakLag + (isFinite(shift) ? shift : 0)

  const frequency = sampleRate / refinedLag
  if (frequency < 50 || frequency > 1200) return null

  // Convert frequency to note
  const semitonesFromA4 = 12 * Math.log2(frequency / 440)
  const nearestSemitone = Math.round(semitonesFromA4)
  const cents = Math.round((semitonesFromA4 - nearestSemitone) * 100)
  const noteIndex = ((nearestSemitone % 12) + 12 + 9) % 12 // A=0, so offset by 9 to get C=0
  const octave = Math.floor((nearestSemitone + 9) / 12) + 4

  return {
    frequency,
    note: NOTE_NAMES[noteIndex],
    octave,
    cents,
  }
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export interface PitchResult {
  frequency: number
  note: string
  octave: number
  cents: number
}

const computeRmsFloat = (buffer: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}

const autocorrelate = (buffer: Float32Array): Float32Array => {
  const size = buffer.length
  const correlation = new Float32Array(size)
  for (let lag = 0; lag < size; lag++) {
    let sum = 0
    for (let i = 0; i < size - lag; i++) {
      sum += buffer[i] * buffer[i + lag]
    }
    correlation[lag] = sum
  }
  return correlation
}

const findPeak = (
  correlation: Float32Array,
  minLag: number,
  maxLag: number,
): { lag: number; value: number } | null => {
  let bestLag = 0
  let bestVal = 0

  for (let lag = minLag; lag < maxLag; lag++) {
    const isPeak = correlation[lag] > correlation[lag - 1] && correlation[lag] > correlation[lag + 1]
    if (isPeak && correlation[lag] > bestVal) {
      bestVal = correlation[lag]
      bestLag = lag
    }
  }

  return bestLag > 0 ? { lag: bestLag, value: bestVal } : null
}

const interpolatePeak = (correlation: Float32Array, lag: number): number => {
  const prev = correlation[lag - 1]
  const curr = correlation[lag]
  const next = correlation[lag + 1]
  const shift = (prev - next) / (2 * (prev - 2 * curr + next))
  return lag + (isFinite(shift) ? shift : 0)
}

const frequencyToNote = (frequency: number): Pick<PitchResult, 'note' | 'octave' | 'cents'> => {
  const semitonesFromA4 = 12 * Math.log2(frequency / 440)
  const nearestSemitone = Math.round(semitonesFromA4)
  const cents = Math.round((semitonesFromA4 - nearestSemitone) * 100)
  const noteIndex = ((nearestSemitone % 12) + 12 + 9) % 12
  const octave = Math.floor((nearestSemitone + 9) / 12) + 4
  return { note: NOTE_NAMES[noteIndex], octave, cents }
}

export const detectPitch = (analyser: AnalyserNode, sampleRate: number): PitchResult | null => {
  const buffer = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(buffer)

  if (computeRmsFloat(buffer) < 0.01) return null

  const correlation = autocorrelate(buffer)
  const minLag = Math.floor(sampleRate / 1200)
  const maxLag = Math.min(Math.floor(sampleRate / 50), buffer.length)
  const peak = findPeak(correlation, minLag, maxLag)

  if (!peak) return null

  const refinedLag = interpolatePeak(correlation, peak.lag)
  const frequency = sampleRate / refinedLag

  if (frequency < 50 || frequency > 1200) return null

  return { frequency, ...frequencyToNote(frequency) }
}

export const smoothPitch = (
  recent: PitchResult[],
  current: PitchResult,
): PitchResult => {
  const avgCents = Math.round(
    recent.reduce((sum, p) => sum + p.cents, 0) / recent.length,
  )

  const counts = recent.reduce((map, p) => {
    const key = `${p.note}${p.octave}`
    map.set(key, (map.get(key) ?? 0) + 1)
    return map
  }, new Map<string, number>())

  const bestNote = recent.reduce((best, p) => {
    const key = `${p.note}${p.octave}`
    return (counts.get(key) ?? 0) > (counts.get(`${best.note}${best.octave}`) ?? 0) ? p : best
  }, current)

  return { ...bestNote, cents: avgCents }
}

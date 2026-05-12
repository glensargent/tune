import { Mp3Encoder } from '@breezystack/lamejs'

const writeString = (view: DataView, offset: number, str: string) => {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

export const encodeWav = (buffer: AudioBuffer): ArrayBuffer => {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const dataLength = buffer.length * blockAlign
  const totalLength = 44 + dataLength

  const out = new ArrayBuffer(totalLength)
  const view = new DataView(out)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, totalLength - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  const channels: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch))
  }

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]))
      view.setInt16(offset, sample * 0x7fff, true)
      offset += bytesPerSample
    }
  }

  return out
}

export const encodeWavFromPcm = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const numChannels = 1
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const dataLength = samples.length * bytesPerSample
  const totalLength = 44 + dataLength

  const out = new ArrayBuffer(totalLength)
  const view = new DataView(out)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, totalLength - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s * 0x7fff, true)
    offset += bytesPerSample
  }

  return out
}

const floatTo16Bit = (float32: Float32Array): Int16Array => {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s * 0x7fff
  }
  return int16
}

export const encodeMp3 = (buffer: AudioBuffer, kbps: number = 192): Blob => {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps)

  const left = floatTo16Bit(buffer.getChannelData(0))
  const right = numChannels > 1 ? floatTo16Bit(buffer.getChannelData(1)) : undefined

  const blockSize = 1152
  const parts: Uint8Array[] = []

  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize)
    const rightChunk = right?.subarray(i, i + blockSize)
    const encoded = encoder.encodeBuffer(leftChunk, rightChunk)
    if (encoded.length > 0) parts.push(new Uint8Array(encoded.buffer))
  }

  const flushed = encoder.flush()
  if (flushed.length > 0) parts.push(new Uint8Array(flushed.buffer))

  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' })
}

export const encodeMp3FromPcm = (samples: Float32Array, sampleRate: number, kbps: number = 192): Blob => {
  const encoder = new Mp3Encoder(1, sampleRate, kbps)
  const int16 = floatTo16Bit(samples)

  const blockSize = 1152
  const parts: Uint8Array[] = []

  for (let i = 0; i < int16.length; i += blockSize) {
    const chunk = int16.subarray(i, i + blockSize)
    const encoded = encoder.encodeBuffer(chunk)
    if (encoded.length > 0) parts.push(new Uint8Array(encoded.buffer))
  }

  const flushed = encoder.flush()
  if (flushed.length > 0) parts.push(new Uint8Array(flushed.buffer))

  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' })
}

export const audioBufferFromBlob = async (blob: Blob): Promise<AudioBuffer> => {
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  await ctx.close()
  return decoded
}

import { describe, it, expect } from 'vitest'
import { extractBoundary, parseMjpegStream } from '@/utils/mjpegStreamParser'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function createStream(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk))
      controller.close()
    },
  })
}

async function blobToString(blob: Blob) {
  const buffer = await blob.arrayBuffer()
  return decoder.decode(buffer)
}

function buildMultipart(boundary: string, frames: Uint8Array[]) {
  const parts: Uint8Array[] = []

  frames.forEach(frame => {
    const headers = encoder.encode(
      `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
    )
    parts.push(headers, frame, encoder.encode('\r\n'))
  })

  parts.push(encoder.encode(`--${boundary}--`))
  return parts
}

describe('mjpegStreamParser', () => {
  it('parses multiple frames separated by boundary', async () => {
    const boundary = 'frame-boundary'
    const frames = [encoder.encode('frame-1'), encoder.encode('frame-2')]
    const stream = createStream(buildMultipart(boundary, frames))

    const received: string[] = []
    for await (const blob of parseMjpegStream(stream, boundary)) {
      received.push(await blobToString(blob))
    }

    expect(received).toEqual(['frame-1', 'frame-2'])
  })

  it('handles boundary split across chunks', async () => {
    const boundary = 'split-boundary'
    const frame = encoder.encode('only-frame')

    const prefix = encoder.encode(`--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`)
    const suffix = encoder.encode(`\r\n--${boundary}--`)

    // 故意把 boundary 跨 chunk 拆开
    const stream = createStream([prefix.slice(0, 5), prefix.slice(5), frame, suffix])

    const blobs = []
    for await (const blob of parseMjpegStream(stream, boundary)) {
      blobs.push(await blobToString(blob))
    }

    expect(blobs).toEqual(['only-frame'])
  })

  it('skips leading noise before first boundary', async () => {
    const boundary = 'noise-boundary'
    const frames = [encoder.encode('noise-frame')]
    const noise = encoder.encode('garbage')

    const stream = createStream([noise, ...buildMultipart(boundary, frames)])

    const result: string[] = []
    for await (const blob of parseMjpegStream(stream, boundary)) {
      result.push(await blobToString(blob))
    }

    expect(result).toEqual(['noise-frame'])
  })

  it('cancels reader when consumer stops early', async () => {
    const boundary = 'cancel-boundary'
    const frames = [encoder.encode('first')]
    let cancelled = false

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        buildMultipart(boundary, frames).forEach(chunk => controller.enqueue(chunk))
      },
      cancel() {
        cancelled = true
      },
    })

    const iterator = parseMjpegStream(stream, boundary)
    const first = await iterator.next()
    expect(first.value).toBeInstanceOf(Blob)
    await iterator.return?.()

    expect(cancelled).toBe(true)
  })

  it('normalizes boundary from header value', () => {
    expect(extractBoundary('multipart/x-mixed-replace; boundary=--abc123')).toBe('abc123')
    expect(extractBoundary('multipart/x-mixed-replace; boundary="weird"')).toBe('weird')
    expect(extractBoundary(null)).toBeNull()
  })
})

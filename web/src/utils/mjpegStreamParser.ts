const encoder = new TextEncoder()

function normalizeBoundary(raw: string): string {
  return raw.replace(/^--/, '').trim()
}

function findSequence(buffer: Uint8Array, sequence: Uint8Array, start = 0): number {
  if (!sequence.length) return -1
  for (let i = start; i <= buffer.length - sequence.length; i++) {
    let matched = true
    for (let j = 0; j < sequence.length; j++) {
      if (buffer[i + j] !== sequence[j]) {
        matched = false
        break
      }
    }
    if (matched) return i
  }
  return -1
}

function concatBuffer(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  if (!a.length) return new Uint8Array(b) as Uint8Array<ArrayBuffer>
  if (!b.length) return new Uint8Array(a) as Uint8Array<ArrayBuffer>
  const result = new Uint8Array(a.length + b.length)
  result.set(a, 0)
  result.set(b, a.length)
  return result
}

export function extractBoundary(contentType?: string | null): string | null {
  if (!contentType) return null
  const match = /boundary="?([^";]+)"?/i.exec(contentType)
  if (!match) return null
  return normalizeBoundary(match[1]!)
}

export function parseMjpegStream(
  stream: ReadableStream<Uint8Array>,
  boundary: string
): AsyncIterableIterator<Blob> {
  const normalizedBoundary = normalizeBoundary(boundary)
  const boundaryBytes = encoder.encode(`--${normalizedBoundary}`)
  const headerDelimiter = encoder.encode('\r\n\r\n')

  const reader = stream.getReader()

  return (async function* (): AsyncIterableIterator<Blob> {
    let buffer = new Uint8Array(0)
    let streamDone = false

    try {
      while (true) {
        const { value, done } = await reader.read()
        streamDone = !!done
        if (value) {
          buffer = concatBuffer(buffer, value)
        }

        // 尝试在当前缓冲中切出完整帧
        let parsed = true
        while (parsed) {
          parsed = false

          // 对齐到第一个 boundary
          const boundaryIndex = findSequence(buffer, boundaryBytes)
          if (boundaryIndex === -1) break
          if (boundaryIndex > 0) {
            buffer = buffer.slice(boundaryIndex)
          }

          const headerStart = boundaryBytes.length
          const headerEnd = findSequence(buffer, headerDelimiter, headerStart)
          if (headerEnd === -1) break

          const contentStart = headerEnd + headerDelimiter.length
          const nextBoundaryIndex = findSequence(buffer, boundaryBytes, contentStart)
          if (nextBoundaryIndex === -1) break

          let frameEnd = nextBoundaryIndex
          if (
            frameEnd >= 2 &&
            buffer[frameEnd - 2] === 13 &&
            buffer[frameEnd - 1] === 10
          ) {
            frameEnd -= 2 // 去掉 \r\n
          }

          const frameBytes = buffer.slice(contentStart, frameEnd)
          if (frameBytes.length) {
            yield new Blob([frameBytes], { type: 'image/jpeg' })
          }

          buffer = buffer.slice(nextBoundaryIndex)
          parsed = true
        }

        if (done) break
      }
    } finally {
      if (!streamDone) {
        await reader.cancel().catch(() => {
          // 取消错误可安全忽略：reader.cancel() 在流已关闭或网络断开时可能抛出，
          // 但此时我们已经在清理阶段，无需处理这些预期的失败情况
        })
      }
      reader.releaseLock()
    }
  })()
}

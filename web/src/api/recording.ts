import type { RecordingFile } from '@/types/recording'

const BASE_URL = import.meta.env.DEV ? 'http://127.0.0.1:20242' : ''

export interface RecordingMetadata {
  group: string
  name: string
  path: string
  size: number
  created_at: number
  modified_at: number
}

export interface SaveRecordingRequest {
  group: string
  name: string
  data: RecordingFile
}

/**
 * 保存录制到服务器
 */
export async function saveRecording(request: SaveRecordingRequest): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/recordings/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const errorText = await response.text()
    const errorMsg = `保存录制"${request.name}"失败 (分组:${request.group}, HTTP ${response.status}): ${errorText}`
    console.error(errorMsg, { request, status: response.status })
    throw new Error(errorMsg)
  }
}

/**
 * 列出所有录制
 */
export async function listRecordings(): Promise<RecordingMetadata[]> {
  const response = await fetch(`${BASE_URL}/api/recordings/list`)

  if (!response.ok) {
    const errorText = await response.text()
    const errorMsg = `获取录制列表失败 (HTTP ${response.status}): ${errorText}`
    console.error(errorMsg, { status: response.status })
    throw new Error(errorMsg)
  }

  const data = await response.json()
  return data.recordings
}

/**
 * 加载录制文件
 */
export async function loadRecording(group: string, name: string): Promise<RecordingFile> {
  const response = await fetch(
    `${BASE_URL}/api/recordings/load?group=${encodeURIComponent(group)}&name=${encodeURIComponent(name)}`
  )

  if (!response.ok) {
    const errorText = await response.text()
    const errorMsg = `加载录制"${name}"失败 (分组:${group}, HTTP ${response.status}): ${errorText}`
    console.error(errorMsg, { group, name, status: response.status })
    throw new Error(errorMsg)
  }

  const data = await response.json()
  return data.data
}

/**
 * 删除录制文件
 */
export async function deleteRecording(group: string, name: string): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/api/recordings/delete?group=${encodeURIComponent(group)}&name=${encodeURIComponent(name)}`,
    {
      method: 'DELETE',
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    const errorMsg = `删除录制"${name}"失败 (分组:${group}, HTTP ${response.status}): ${errorText}`
    console.error(errorMsg, { group, name, status: response.status })
    throw new Error(errorMsg)
  }
}

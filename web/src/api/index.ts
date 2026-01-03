import type { DeviceInfo, AppInfo, HierarchyData, CurrentAppResponse, TapRequest, Platform, RawUINode } from './types'
import { convertRawHierarchy } from './types'

const API_BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${response.status}: ${text}`)
  }
  return response.json()
}

// 获取应用信息
export async function getAppInfo(): Promise<AppInfo> {
  return request<AppInfo>(`${API_BASE}/info`)
}

// 获取设备列表
export async function getDeviceList(platform: Platform): Promise<DeviceInfo[]> {
  return request<DeviceInfo[]>(`${API_BASE}/${platform}/list`)
}

// 获取设备截图 URL (display id 固定为 0，用 timestamp 做缓存刷新)
export function getScreenshotUrl(platform: Platform, serial: string): string {
  return `${API_BASE}/${platform}/${serial}/screenshot/0?t=${Date.now()}`
}

// 获取 UI 层级
export async function getHierarchy(platform: Platform, serial: string): Promise<HierarchyData> {
  const raw = await request<RawUINode>(`${API_BASE}/${platform}/${serial}/hierarchy`)
  return convertRawHierarchy(raw)
}

// 获取当前应用
export async function getCurrentApp(platform: Platform, serial: string): Promise<CurrentAppResponse> {
  return request<CurrentAppResponse>(`${API_BASE}/${platform}/${serial}/command/currentApp`)
}

// 点击
export async function tap(platform: Platform, serial: string, x: number, y: number): Promise<void> {
  const body: TapRequest = { x, y }
  await request(`${API_BASE}/${platform}/${serial}/command/tap`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// 发送命令
export async function sendCommand(
  platform: Platform,
  serial: string,
  command: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  return request(`${API_BASE}/${platform}/${serial}/command/${command}`, {
    method: 'POST',
    body: JSON.stringify(params || {}),
  })
}

// 获取平台功能
export async function getFeatures(platform: Platform): Promise<Record<string, boolean>> {
  return request<Record<string, boolean>>(`${API_BASE}/${platform}/features`)
}

export * from './types'

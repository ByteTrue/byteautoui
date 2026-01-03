/**
 * 文件下载工具
 * 统一处理文件下载逻辑，避免代码重复
 */

/**
 * 下载JSON文件
 * @param data - 要下载的数据对象
 * @param filename - 文件名（不含扩展名）
 * @param prettyPrint - 是否格式化JSON（默认true）
 */
export function downloadJSON(data: any, filename: string, prettyPrint = true): void {
  const json = prettyPrint ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  const blob = new Blob([json], { type: 'application/json' })
  downloadBlob(blob, `${filename}.json`)
}

/**
 * 下载Blob对象
 * @param blob - Blob对象
 * @param filename - 文件名（包含扩展名）
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()

  // 延迟释放URL，避免下载失败
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 100)
}

/**
 * 下载文本文件
 * @param text - 文本内容
 * @param filename - 文件名（包含扩展名）
 * @param mimeType - MIME类型（默认text/plain）
 */
export function downloadText(text: string, filename: string, mimeType = 'text/plain'): void {
  const blob = new Blob([text], { type: mimeType })
  downloadBlob(blob, filename)
}

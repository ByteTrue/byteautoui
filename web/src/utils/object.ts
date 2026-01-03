/**
 * 对象工具函数
 */

/**
 * 深拷贝对象
 * 使用 JSON 序列化实现，适用于可序列化的对象
 *
 * @param obj 要拷贝的对象
 * @returns 深拷贝后的新对象
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

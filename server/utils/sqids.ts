// Sqids 编解码工具 - 将自增ID转换为短字符串
import Sqids from 'sqids'
import { SQIDS_ALPHABET, SQIDS_MIN_LENGTH } from '../../app/shared/constants'

// 使用共享配置确保前后端编码结果一致
const sqids = new Sqids({
  alphabet: SQIDS_ALPHABET,
  minLength: SQIDS_MIN_LENGTH,
})

// 编码：数字ID -> 短字符串
export function encodeTaskId(id: number): string {
  return sqids.encode([id])
}

// 解码：短字符串 -> 数字ID
export function decodeTaskId(sqid: string): number | null {
  try {
    const decoded = sqids.decode(sqid)
    return decoded.length > 0 ? decoded[0] : null
  } catch {
    return null
  }
}

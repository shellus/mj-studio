// POST /api/conversations/[id]/compress - 发起对话压缩
import { useConversationService } from '../../../services/conversation'
import { useUserSettingsService } from '../../../services/userSettings'
import {
  USER_SETTING_KEYS,
  DEFAULT_COMPRESS_PROMPT,
} from '../../../../app/shared/constants'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, message: '对话ID不能为空' })
  }

  const conversationId = parseInt(id, 10)
  if (isNaN(conversationId)) {
    throw createError({ statusCode: 400, message: '无效的对话ID' })
  }

  // 获取用户设置
  const settingsService = useUserSettingsService()
  const compressKeepCount = await settingsService.get<number>(user.id, USER_SETTING_KEYS.GENERAL_COMPRESS_KEEP_COUNT)
  const compressPrompt = await settingsService.get<string>(user.id, USER_SETTING_KEYS.PROMPT_COMPRESS)

  // 获取对话和消息
  const conversationService = useConversationService()
  const result = await conversationService.getWithMessages(conversationId)

  if (!result) {
    throw createError({ statusCode: 404, message: '对话不存在' })
  }

  if (result.conversation.userId !== user.id) {
    throw createError({ statusCode: 403, message: '无权访问此对话' })
  }

  const { messages } = result

  // 过滤掉压缩请求消息，只保留有效消息
  const validMessages = messages.filter(m => m.mark !== 'compress-request')

  if (validMessages.length < compressKeepCount + 2) {
    throw createError({ statusCode: 400, message: '对话消息太少，无需压缩' })
  }

  // 找到最后一个 compress-response 消息的位置（上次压缩点）
  let lastCompressIndex = -1
  for (let i = validMessages.length - 1; i >= 0; i--) {
    const msg = validMessages[i]
    if (msg && msg.mark === 'compress-response') {
      lastCompressIndex = i
      break
    }
  }

  // 计算压缩范围
  // 从上次压缩点之后开始（或从头开始），到保留消息之前
  const startIndex = lastCompressIndex >= 0 ? lastCompressIndex : 0
  const endIndex = validMessages.length - compressKeepCount

  if (endIndex <= startIndex) {
    throw createError({ statusCode: 400, message: '可压缩的消息太少' })
  }

  // 待压缩的消息（从 startIndex 到 endIndex，不包含 endIndex）
  const messagesToCompress = validMessages.slice(startIndex, endIndex)
  // 保留的消息（最后 COMPRESS_KEEP_COUNT 条）
  const keepMessages = validMessages.slice(endIndex)

  if (messagesToCompress.length < 2) {
    throw createError({ statusCode: 400, message: '可压缩的消息太少' })
  }

  // 构建待压缩的消息内容
  const messagesContent = messagesToCompress
    .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
    .join('\n\n')

  // 替换占位符
  const finalPrompt = compressPrompt.replace('{messages}', messagesContent)

  // 计算 sortId
  // 压缩请求的 sortId = 待压缩消息最后一条的 sortId + 1
  const lastCompressMsg = messagesToCompress[messagesToCompress.length - 1]
  if (!lastCompressMsg) {
    throw createError({ statusCode: 400, message: '可压缩的消息太少' })
  }
  const compressRequestSortId = (lastCompressMsg.sortId || lastCompressMsg.id) + 1

  // 插入压缩请求消息
  const compressRequest = await conversationService.addMessage(user.id, {
    conversationId,
    role: 'user',
    content: finalPrompt,
    mark: 'compress-request',
    sortId: compressRequestSortId,
  })

  // 更新保留消息的 sortId（压缩响应的 sortId 会在 messages.post.ts 中设置）
  // 保留消息的 sortId 从 compressRequestSortId + 2 开始（+1 是压缩响应）
  for (let i = 0; i < keepMessages.length; i++) {
    const keepMsg = keepMessages[i]
    if (keepMsg) {
      const newSortId = compressRequestSortId + 2 + i
      await conversationService.updateMessageSortId(keepMsg.id, newSortId)
    }
  }

  return {
    success: true,
    compressRequest,
    stats: {
      messagesToCompressCount: messagesToCompress.length,
      keepMessagesCount: keepMessages.length,
      compressRequestSortId,
    },
  }
})

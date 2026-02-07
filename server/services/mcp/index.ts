/**
 * MCP 服务 - 工具定义和服务创建
 *
 * 提供 MCP 工具供外部 AI 客户端调用
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { AuthUser } from '../../../app/shared/types'

// 导入各个工具的实现
import { listModels } from './tools/list-models'
// 导入 prompts
import { asyncTaskGuidePrompt } from './prompts/async-task-guide'
import { listAssistants } from './tools/list-assistants'
import { listConversations } from './tools/list-conversations'
import { getConversation } from './tools/get-conversation'
import { chat } from './tools/chat'
import { generateImage } from './tools/generate-image'
import { generateVideo } from './tools/generate-video'
import { getTask } from './tools/get-task'
import { listTasks } from './tools/list-tasks'
import { getUploadUrl } from './tools/get-upload-url'

/**
 * 创建 MCP 服务器实例
 * 每个用户会话创建一个独立的服务器实例
 */
export function createMcpServer(user: AuthUser): McpServer {
  const server = new McpServer({
    name: 'mj-studio',
    version: '1.0.0',
  })

  // 查询工具
  server.tool(
    'list_models',
    'List available AI models configured by the user',
    { category: z.enum(['chat', 'image', 'video']).optional().describe('Model category filter') },
    async ({ category }) => listModels(user, category),
  )

  server.tool(
    'list_assistants',
    'List user\'s AI assistants',
    {},
    async () => listAssistants(user),
  )

  // 对话工具
  server.tool(
    'list_conversations',
    'List conversations of an assistant',
    {
      assistantId: z.number().describe('Assistant ID'),
      limit: z.number().optional().describe('Max number of results, default 20, max 50'),
    },
    async ({ assistantId, limit }) => listConversations(user, assistantId, limit),
  )

  server.tool(
    'get_conversation',
    'Get conversation details with messages',
    { conversationId: z.number().describe('Conversation ID') },
    async ({ conversationId }) => getConversation(user, conversationId),
  )

  server.tool(
    'chat',
    'Send a message to an assistant and get AI response',
    {
      assistantId: z.number().describe('Assistant ID'),
      message: z.string().describe('User message content'),
      conversationId: z.number().optional().describe('Conversation ID, create new if not provided'),
      title: z.string().optional().describe('Conversation title, only for new conversations, auto-generate if not provided'),
      stream: z.boolean().optional().describe('Enable streaming response, default false'),
    },
    async ({ assistantId, message, conversationId, title, stream }) =>
      chat(user, assistantId, message, conversationId, title, stream),
  )

  // 文件上传工具
  server.tool(
    'get_upload_url',
    'Get a temporary upload URL for uploading local files. Use the returned curl command to upload files, then use the returned URL as image input for generate_image/generate_video.',
    {},
    async () => getUploadUrl(user),
  )

  // 图片生成工具
  server.tool(
    'generate_image',
    'Generate or edit images. Supports: 1) Text-to-image: generate from prompt only; 2) Image-to-image: transform/edit based on reference images with prompt guidance',
    {
      aimodelId: z.number().describe('Model ID from list_models'),
      prompt: z.string().describe('Image description or editing instructions'),
      images: z.array(z.string()).optional().describe('Reference images for editing/transformation (image-to-image). Provide URLs or base64 data'),
      modelParams: z.record(z.string(), z.unknown()).optional().describe('Model-specific parameters'),
      blocking: z.boolean().optional().describe('Wait for task completion before returning (default true). Set to false for async mode.'),
    },
    async ({ aimodelId, prompt, images, modelParams, blocking }) =>
      generateImage(user, aimodelId, prompt, images, modelParams, blocking ?? true),
  )

  // 视频生成工具
  server.tool(
    'generate_video',
    'Generate videos. Supports: 1) Text-to-video: generate from prompt only; 2) Image-to-video: animate a static image with prompt guidance',
    {
      aimodelId: z.number().describe('Model ID from list_models'),
      prompt: z.string().describe('Video description or animation instructions'),
      images: z.array(z.string()).optional().describe('Starting frame images for image-to-video generation. Provide URLs or base64 data'),
      modelParams: z.record(z.string(), z.unknown()).optional().describe('Model-specific parameters'),
      blocking: z.boolean().optional().describe('Wait for task completion before returning (default true). Set to false for async mode.'),
    },
    async ({ aimodelId, prompt, images, modelParams, blocking }) =>
      generateVideo(user, aimodelId, prompt, images, modelParams, blocking ?? true),
  )

  // 任务查询工具
  server.tool(
    'get_task',
    'Get task status and result',
    { taskId: z.number().describe('Task ID') },
    async ({ taskId }) => getTask(user, taskId),
  )

  server.tool(
    'list_tasks',
    'List user\'s tasks',
    {
      taskType: z.enum(['image', 'video']).optional().describe('Task type filter'),
      status: z.enum(['pending', 'submitting', 'processing', 'success', 'failed', 'cancelled']).optional().describe('Status filter'),
      limit: z.number().optional().describe('Max number of results, default 10, max 50'),
    },
    async ({ taskType, status, limit }) => listTasks(user, taskType, status, limit),
  )

  // 注册 prompts
  server.prompt(
    asyncTaskGuidePrompt.name,
    asyncTaskGuidePrompt.description,
    async () => ({
      messages: [{
        role: 'user',
        content: { type: 'text', text: asyncTaskGuidePrompt.content },
      }],
    }),
  )

  return server
}

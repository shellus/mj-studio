/**
 * async-task-guide prompt
 * 指导客户端如何正确处理异步任务（图片/视频生成）
 */

export const asyncTaskGuidePrompt = {
  name: 'async_task_guide',
  description: 'Guidelines for handling tasks (image/video generation) and file uploads',
  content: `# Task Handling Guide

## Default Behavior: Blocking Mode

By default, \`generate_image\` and \`generate_video\` will **block and wait** until the task completes, then return the result directly.

### Response Format (blocking=true, default)

\`\`\`json
{
  "taskId": 123,
  "status": "success",
  "resourceUrl": "https://domain/api/files/xxx.png"
}
\`\`\`

Or on failure:
\`\`\`json
{
  "taskId": 123,
  "status": "failed",
  "error": "error message"
}
\`\`\`

Or on timeout (image: 3min, video: 10min):
\`\`\`json
{
  "taskId": 123,
  "status": "timeout",
  "message": "Use get_task to check status later."
}
\`\`\`

### Recommended Workflow (blocking mode)

1. Call \`generate_image\` or \`generate_video\` (blocking=true is default)
2. The tool will wait and return the final result
3. Show the result to the user

## Async Mode (blocking=false)

Set \`blocking: false\` to get immediate response with taskId, then poll manually.

### Response Format (blocking=false)

\`\`\`json
{
  "taskId": 123,
  "status": "pending",
  "estimatedTime": 60
}
\`\`\`

### Polling Strategy for Async Mode

**DO NOT poll immediately or continuously!**

1. Wait at least \`estimatedTime\` seconds before calling \`get_task\`
2. If still processing, wait another 10-30 seconds
3. Maximum 3-5 queries total

## File Upload (for image-to-image / image-to-video)

To upload local files as input images:

1. Call \`get_upload_url\` to get a temporary upload URL and curl command
2. Execute the returned curl command to upload the file
3. Use the returned URL as the \`images\` parameter

## Task Status Values

- \`pending\`: Task created, waiting to start
- \`submitting\`: Submitting to upstream API
- \`processing\`: Being processed by AI model
- \`success\`: Completed successfully (resourceUrl available)
- \`failed\`: Failed (error message available)
- \`cancelled\`: Cancelled by user
`,
}

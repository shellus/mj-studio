/**
 * async-task-guide prompt
 * 指导客户端如何正确处理异步任务（图片/视频生成）
 */

export const asyncTaskGuidePrompt = {
  name: 'async_task_guide',
  description: 'Guidelines for handling async tasks (image/video generation) - READ THIS BEFORE using generate_image or generate_video',
  content: `# Async Task Handling Guide

When using \`generate_image\` or \`generate_video\` tools, the task runs asynchronously. Follow these guidelines:

## Response Format

After calling \`generate_image\` or \`generate_video\`, you will receive:
\`\`\`json
{
  "taskId": 123,
  "status": "pending",
  "estimatedTime": 60
}
\`\`\`

- \`taskId\`: Use this to query task status
- \`status\`: Initial status is always "pending"
- \`estimatedTime\`: Estimated completion time in SECONDS

## IMPORTANT: Polling Strategy

**DO NOT poll immediately or continuously!**

1. **Wait before first query**: Wait at least \`estimatedTime\` seconds before calling \`get_task\`
2. **If task still processing**: Wait another 10-30 seconds before next query
3. **Maximum 3-5 queries**: If still not complete, inform the user and stop polling

## Recommended Workflow

1. Call \`generate_image\` or \`generate_video\`
2. Tell the user: "Task submitted. Estimated completion: {estimatedTime} seconds. I'll check the result after that."
3. **If your client supports sleep/wait**: Wait for \`estimatedTime\` seconds, then call \`get_task\`
4. **If your client does NOT support sleep**: Tell the user "Please ask me to check the result in about {estimatedTime} seconds" and STOP. Wait for user to ask before querying.

## Task Status Values

- \`pending\`: Task created, waiting to start
- \`submitting\`: Submitting to upstream API
- \`processing\`: Being processed by AI model
- \`success\`: Completed successfully (resourceUrl available)
- \`failed\`: Failed (error message available)
- \`cancelled\`: Cancelled by user

## Example Conversation

**Good:**
> User: Generate an image of a sunset
> Assistant: I'll create that image for you.
> [calls generate_image]
> Assistant: Task submitted (ID: 123). The estimated time is 60 seconds. I'll check the result after that time.
> [waits 60 seconds or asks user to wait]
> [calls get_task]
> Assistant: Here's your image: [shows result]

**Bad (causes timeout issues):**
> User: Generate an image of a sunset
> Assistant: I'll create that image for you.
> [calls generate_image]
> [immediately calls get_task] - still pending
> [calls get_task again] - still pending
> [calls get_task again] - still pending
> ... (loops until client timeout)
`,
}

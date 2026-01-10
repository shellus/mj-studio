// 启动异步任务状态轮询器
import { startTaskPoller } from '../services/taskPoller'

export default defineNitroPlugin(() => {
  startTaskPoller()
})

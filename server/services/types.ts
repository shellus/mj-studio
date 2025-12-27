// 统一的图像生成结果类型
export interface GenerateResult {
  success: boolean
  resourceUrl?: string    // 远程资源URL（图片或视频）
  imageBase64?: string    // base64图片数据
  mimeType?: string       // 资源MIME类型
  error?: string          // 错误信息
}

// 图像生成服务接口
export interface ImageGeneratorService {
  // 文生图
  generateImage(prompt: string, modelName?: string): Promise<GenerateResult>
  // 垫图（带参考图）
  generateImageWithRef?(prompt: string, images: string[], modelName?: string): Promise<GenerateResult>
}

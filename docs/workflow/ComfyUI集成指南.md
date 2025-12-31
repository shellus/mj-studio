# ComfyUI 集成指南

本文档介绍如何将 MJ-Studio 作为 ComfyUI 自定义节点集成，让用户在 ComfyUI 工作流中使用 MJ-Studio 的 AI 绘图/视频能力。

## 概述

### 集成模式

```
┌─────────────────────────────────────────────────────────┐
│                    用户的 ComfyUI                        │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────┐ │
│  │ 文本输入  │──▶│ MJ-Studio │──▶│ 图片预览/保存        │ │
│  │ (内置)   │   │ 节点(我们) │   │ (内置)              │ │
│  └──────────┘   └─────┬─────┘   └──────────────────────┘ │
└────────────────────────┼────────────────────────────────┘
                         │ HTTP API
                         ▼
              ┌─────────────────────┐
              │    MJ-Studio 后端   │
              │    /api/tasks       │
              └─────────────────────┘
```

### 我们需要做什么

| 任务 | 说明 |
|-----|------|
| 开发节点包 | Python 包，约 200-300 行代码 |
| 发布到 Registry | ComfyUI 官方节点市场 |
| 维护 | 极低成本，本质是 HTTP 客户端 |

### 我们不需要做什么

- ❌ 部署 ComfyUI
- ❌ 维护 ComfyUI 实例
- ❌ 开发工作流编辑器

用户在自己的 ComfyUI 环境（本地/云端）安装我们的节点包即可。

---

## 节点设计

### 节点清单

| 节点 | 功能 | 输入 | 输出 |
|-----|------|-----|------|
| `MJStudio_GenImage` | AI 图像生成 | prompt, model, image? | IMAGE |
| `MJStudio_GenVideo` | AI 视频生成 | prompt, model, image? | VIDEO |
| `MJStudio_Config` | 配置节点 | api_url, api_token | CONFIG |

### 支持的模型

**图像模型**：
- Midjourney
- DALL-E 3
- Flux
- Gemini
- 豆包

**视频模型**：
- 即梦
- Veo
- Sora
- Grok Video

---

## 代码实现

### 目录结构

```
comfyui-mjstudio/
├── __init__.py           # 节点注册
├── nodes.py              # 节点实现
├── utils.py              # 工具函数
├── pyproject.toml        # 包配置
├── README.md             # 说明文档
└── examples/             # 示例工作流
    ├── text2image.json
    └── image2video.json
```

### pyproject.toml

```toml
[project]
name = "comfyui-mjstudio"
version = "0.1.0"
description = "MJ-Studio nodes for ComfyUI - Access Midjourney, DALL-E, Flux, and more"
license = { text = "MIT" }
requires-python = ">=3.9"
dependencies = [
    "requests>=2.28.0",
    "pillow>=9.0.0",
]

[project.urls]
Repository = "https://github.com/your-org/comfyui-mjstudio"

[tool.comfy]
PublisherId = "mjstudio"
DisplayName = "MJ-Studio"
Icon = "https://your-domain.com/icon.png"
```

### \_\_init\_\_.py

```python
from .nodes import MJStudioConfig, MJStudioGenImage, MJStudioGenVideo

NODE_CLASS_MAPPINGS = {
    "MJStudio_Config": MJStudioConfig,
    "MJStudio_GenImage": MJStudioGenImage,
    "MJStudio_GenVideo": MJStudioGenVideo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MJStudio_Config": "MJ-Studio Config",
    "MJStudio_GenImage": "MJ-Studio Image",
    "MJStudio_GenVideo": "MJ-Studio Video",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
```

### nodes.py

```python
import io
import time
import requests
import torch
import numpy as np
from PIL import Image


class MJStudioConfig:
    """配置节点：设置 API 地址和认证信息"""

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "api_url": ("STRING", {
                    "default": "http://localhost:3000",
                    "tooltip": "MJ-Studio API 地址"
                }),
                "api_token": ("STRING", {
                    "default": "",
                    "tooltip": "JWT Token，从 MJ-Studio 设置页面获取"
                }),
            }
        }

    RETURN_TYPES = ("MJSTUDIO_CONFIG",)
    RETURN_NAMES = ("config",)
    FUNCTION = "create_config"
    CATEGORY = "MJ-Studio"

    def create_config(self, api_url, api_token):
        return ({
            "api_url": api_url.rstrip("/"),
            "api_token": api_token,
        },)


class MJStudioGenImage:
    """图像生成节点：调用 MJ-Studio API 生成图像"""

    MODELS = ["midjourney", "dalle-3", "flux", "gemini", "doubao", "gpt4o-image"]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "config": ("MJSTUDIO_CONFIG",),
                "prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "图像生成提示词"
                }),
                "model": (s.MODELS, {
                    "default": "midjourney",
                    "tooltip": "选择 AI 模型"
                }),
            },
            "optional": {
                "image": ("IMAGE", {
                    "tooltip": "参考图（可选）"
                }),
                "negative_prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "负面提示词（部分模型支持）"
                }),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "generate"
    CATEGORY = "MJ-Studio"

    def generate(self, config, prompt, model, image=None, negative_prompt=""):
        api_url = config["api_url"]
        headers = {"Authorization": f"Bearer {config['api_token']}"}

        # 构建请求
        payload = {
            "prompt": prompt,
            "taskType": "image",
            # 需要根据实际 API 调整字段
        }

        if negative_prompt:
            payload["negativePrompt"] = negative_prompt

        # 如果有参考图，先上传
        if image is not None:
            ref_url = self._upload_image(api_url, headers, image)
            payload["refImages"] = [ref_url]

        # 创建任务
        resp = requests.post(f"{api_url}/api/tasks", json=payload, headers=headers)
        resp.raise_for_status()
        task = resp.json()
        task_id = task["id"]

        # 轮询等待完成
        max_wait = 300  # 最长等待 5 分钟
        start_time = time.time()

        while time.time() - start_time < max_wait:
            resp = requests.get(f"{api_url}/api/tasks/{task_id}", headers=headers)
            resp.raise_for_status()
            task = resp.json()

            if task["status"] == "success":
                break
            elif task["status"] == "failed":
                raise Exception(f"Task failed: {task.get('error', 'Unknown error')}")

            time.sleep(2)
        else:
            raise Exception("Task timeout")

        # 下载结果图片
        resource_url = task["resourceUrl"]
        if not resource_url.startswith("http"):
            resource_url = f"{api_url}{resource_url}"

        img_resp = requests.get(resource_url, headers=headers)
        img_resp.raise_for_status()

        # 转换为 ComfyUI 格式
        img = Image.open(io.BytesIO(img_resp.content)).convert("RGB")
        img_array = np.array(img).astype(np.float32) / 255.0
        img_tensor = torch.from_numpy(img_array).unsqueeze(0)

        return (img_tensor,)

    def _upload_image(self, api_url, headers, image_tensor):
        """上传图片到 MJ-Studio，返回 URL"""
        # 转换 tensor 为 PIL Image
        img_array = (image_tensor.squeeze(0).numpy() * 255).astype(np.uint8)
        img = Image.fromarray(img_array)

        # 转为字节流
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)

        # 上传
        files = {"file": ("image.png", buffer, "image/png")}
        resp = requests.post(f"{api_url}/api/images/upload", files=files, headers=headers)
        resp.raise_for_status()

        return resp.json()["url"]


class MJStudioGenVideo:
    """视频生成节点：调用 MJ-Studio API 生成视频"""

    MODELS = ["jimeng", "veo", "sora", "grok-video"]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "config": ("MJSTUDIO_CONFIG",),
                "prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "视频生成提示词"
                }),
                "model": (s.MODELS, {
                    "default": "jimeng",
                    "tooltip": "选择视频模型"
                }),
            },
            "optional": {
                "image": ("IMAGE", {
                    "tooltip": "首帧参考图（可选）"
                }),
            }
        }

    RETURN_TYPES = ("STRING",)  # 返回视频 URL
    RETURN_NAMES = ("video_url",)
    FUNCTION = "generate"
    CATEGORY = "MJ-Studio"
    OUTPUT_NODE = True

    def generate(self, config, prompt, model, image=None):
        api_url = config["api_url"]
        headers = {"Authorization": f"Bearer {config['api_token']}"}

        payload = {
            "prompt": prompt,
            "taskType": "video",
        }

        # 如果有参考图，先上传
        if image is not None:
            ref_url = self._upload_image(api_url, headers, image)
            payload["refImages"] = [ref_url]

        # 创建任务
        resp = requests.post(f"{api_url}/api/tasks", json=payload, headers=headers)
        resp.raise_for_status()
        task = resp.json()
        task_id = task["id"]

        # 轮询等待完成（视频生成时间较长）
        max_wait = 600  # 最长等待 10 分钟
        start_time = time.time()

        while time.time() - start_time < max_wait:
            resp = requests.get(f"{api_url}/api/tasks/{task_id}", headers=headers)
            resp.raise_for_status()
            task = resp.json()

            if task["status"] == "success":
                break
            elif task["status"] == "failed":
                raise Exception(f"Task failed: {task.get('error', 'Unknown error')}")

            time.sleep(5)
        else:
            raise Exception("Task timeout")

        # 返回视频 URL
        resource_url = task["resourceUrl"]
        if not resource_url.startswith("http"):
            resource_url = f"{api_url}{resource_url}"

        return (resource_url,)

    def _upload_image(self, api_url, headers, image_tensor):
        """上传图片到 MJ-Studio，返回 URL"""
        img_array = (image_tensor.squeeze(0).numpy() * 255).astype(np.uint8)
        img = Image.fromarray(img_array)

        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)

        files = {"file": ("image.png", buffer, "image/png")}
        resp = requests.post(f"{api_url}/api/images/upload", files=files, headers=headers)
        resp.raise_for_status()

        return resp.json()["url"]
```

### utils.py

```python
import io
import torch
import numpy as np
from PIL import Image


def tensor_to_pil(tensor):
    """将 ComfyUI IMAGE tensor 转换为 PIL Image"""
    img_array = (tensor.squeeze(0).numpy() * 255).astype(np.uint8)
    return Image.fromarray(img_array)


def pil_to_tensor(img):
    """将 PIL Image 转换为 ComfyUI IMAGE tensor"""
    img_array = np.array(img.convert("RGB")).astype(np.float32) / 255.0
    return torch.from_numpy(img_array).unsqueeze(0)


def image_to_bytes(img, format="PNG"):
    """将 PIL Image 转换为字节流"""
    buffer = io.BytesIO()
    img.save(buffer, format=format)
    buffer.seek(0)
    return buffer
```

---

## 发布流程

### 1. 准备工作

```bash
# 安装 ComfyUI CLI
pip install comfy-cli

# 登录（需要 Comfy 账号）
comfy login
```

### 2. 验证节点

```bash
# 在 ComfyUI 环境中测试
cd comfyui-mjstudio
comfy node validate
```

### 3. 发布

```bash
# 发布到 Registry
comfy node publish

# 发布新版本
comfy node publish --version 0.2.0
```

### 4. 用户安装

用户在 ComfyUI Manager 中搜索 "MJ-Studio"，点击安装即可。

或使用命令行：

```bash
comfy node install comfyui-mjstudio
```

---

## API 适配

### 需要暴露的 API

节点需要调用以下 MJ-Studio API：

| 端点 | 方法 | 用途 |
|-----|------|-----|
| `/api/tasks` | POST | 创建任务 |
| `/api/tasks/:id` | GET | 查询任务状态 |
| `/api/images/upload` | POST | 上传参考图 |
| `/api/images/:name` | GET | 获取结果图片 |

### 认证方式

使用 JWT Token，用户从 MJ-Studio 设置页面获取。

```
Authorization: Bearer <token>
```

### 考虑事项

1. **Token 生成**：需要在 MJ-Studio 添加 API Token 管理功能
2. **CORS**：如果节点从浏览器环境调用，需要配置跨域
3. **超时处理**：MJ 等模型生成时间较长，需要合理设置超时
4. **错误提示**：返回用户友好的错误信息

---

## 用户使用指南

### 安装步骤

1. 打开 ComfyUI
2. 点击 Manager → Install Custom Nodes
3. 搜索 "MJ-Studio"
4. 点击 Install
5. 重启 ComfyUI

### 配置连接

1. 添加 `MJ-Studio Config` 节点
2. 填写 API 地址（如 `https://your-mjstudio.com`）
3. 填写 API Token（从 MJ-Studio 设置页面获取）

### 示例工作流

**文生图**：

```
[文本输入] → [MJ-Studio Config] → [MJ-Studio Image] → [预览图片]
                                         ↑
                                    [模型选择]
```

**图生视频**：

```
[加载图片] → [MJ-Studio Config] → [MJ-Studio Video] → [保存视频]
                                         ↑
                                    [文本提示词]
```

---

## 后续规划

### Phase 1：基础功能

- [x] 设计节点结构
- [ ] 实现 MJStudio_GenImage
- [ ] 实现 MJStudio_GenVideo
- [ ] 实现 MJStudio_Config
- [ ] 本地测试

### Phase 2：完善功能

- [ ] 添加更多模型参数（尺寸、质量等）
- [ ] 添加进度回调
- [ ] 添加批量生成支持
- [ ] 编写示例工作流

### Phase 3：发布

- [ ] 发布到 ComfyUI Registry
- [ ] 编写用户文档
- [ ] 制作演示视频

---

## 参考资料

- [ComfyUI 官方文档](https://docs.comfy.org/)
- [自定义节点开发教程](https://docs.comfy.org/essentials/custom_node_overview)
- [节点发布指南](https://docs.comfy.org/registry/publishing)
- [ComfyUI Registry](https://registry.comfy.org/)
- [Partner Nodes 示例](https://docs.comfy.org/tutorials/partner-nodes/overview)

# 🍽️ AI Menu Generator

> 一个基于 AI 的菜单生成器，上传菜单图片，自动解析菜品并生成相关的美食照片。

## Features 

* **Vision Parsing**: 使用 GPT-4o Vision 自动识别上传的菜单图片（支持手写、截图）
* **AI Imaging**: 支持 DALL-E 3 或 Nano Banana Pro 根据菜名和描述自动生成图片
* **实时进度显示**: 响应式网页界面，实时展示生成进度和状态
* **并行处理**: 多张图片并行生成，大幅提升处理速度
* **自动降级**: Nano Banana Pro 失败时自动切换到 DALL-E 3

## Tech Stack

* **Framework**: Next.js 16+ (App Router)
* **Styling**: Tailwind CSS
* **AI Models**: 
  - OpenAI GPT-4o (Vision) - 菜单识别
  - DALL-E 3 或 Nano Banana Pro (via NetMind AI) - 图像生成（可配置）

---

## 快速开始

### Prerequisites

* Node.js (v18 或更高版本)
* OpenAI API Key (需支持 GPT-4o Vision)
* NetMind AI API Key (如使用 Nano Banana Pro)

### Installation

1. **Clone the repo**
   ```bash
   git clone https://github.com/Siyu-H/menugen-local.git
   cd menugen-local
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   
   在项目根目录创建一个名为 `.env.local` 的文件，填入你的 API Keys：
   
   **使用 Nano Banana Pro（通过 NetMind AI）：**
   ```env
   OPENAI_API_KEY=sk-proj-your-api-key-here
   NANO_BANANA_PRO_API_KEY=your-netmind-ai-api-key
   IMAGE_GENERATE_MODEL=nano-banana-pro
   ```
   
   > 💡 **提示**：
   > - `IMAGE_GENERATE_MODEL` 环境变量用于选择图像生成模型
   >   - `dall-e-3` - 使用 OpenAI DALL-E 3
   >   - `nano-banana-pro` - 使用 Nano Banana Pro via NetMind AI
   > - 获取 OpenAI API Key：访问 [OpenAI Platform](https://platform.openai.com/api-keys)
   > - 获取 NetMind AI API Key：访问 [NetMind AI](https://www.netmind.ai)，注册账户后在 API Token dashboard 获取

4. **启动应用**
   ```bash
   npm run dev
   ```

5. **使用应用**
   * 打开浏览器访问 [http://localhost:3000](http://localhost:3000)
   * 点击"上传菜单照片"按钮，选择一张菜单图片
   * 等待 AI 分析菜单并生成美食图片
   * 查看生成结果

---

## 运作机制和流程

### 整体流程

应用的工作流程分为两个主要步骤：

#### 步骤 1: 菜单分析 (Menu Analysis)

- **API 端点**: `/api/analyze`
- **使用的模型**: GPT-4o Vision（固定使用）
- **功能**: 
  1. 接收用户上传的菜单图片（Base64 编码）
  2. 使用 GPT-4o Vision 分析图片内容
  3. 提取菜品信息：菜名、价格、描述
  4. 为每个菜品生成英文视觉描述（用于后续图片生成）
- **输出**: JSON 格式的菜品列表，包含：
  ```json
  {
    "menu_items": [
      {
        "name": "菜品名称",
        "price": "价格",
        "description": "英文视觉描述（用于AI绘画）"
      }
    ],
    "model": "GPT-4o Vision"
  }
  ```

#### 步骤 2: 图片生成 (Image Generation)

- **API 端点**: `/api/generate`

**使用 Nano Banana Pro**
```
GPT-4o Vision (分析) → Nano Banana Pro (尝试) → DALL-E 3 (如果失败则降级)
```
- 首先尝试使用 Nano Banana Pro 生成图片
- 如果 Nano Banana Pro 失败或超时，自动降级到 DALL-E 3
- 速度：成功时约 10-60 秒/张，失败时快速切换到 DALL-E 3
- 前端会显示：`GPT-4o Vision → Nano Banana Pro (尝试失败) → DALL-E 3`

### 并行处理机制

- **并行数量**: 默认同时处理 3 张图片
- **优势**: 大幅减少总处理时间

### 实时状态反馈

前端实时显示：
- **总体进度**: 进度条显示"已完成/总数"
- **单个菜品状态**: 
  - ⏳ 等待生成
  - 🎨 正在生成（Nano Banana Pro 会显示预计时间）
  - ✅ 已完成
  - ❌ 失败（显示错误信息）

---

## 项目结构

```
menugen-local/
├── app/
│   ├── api/
│   │   ├── analyze/
│   │   │   └── route.ts      # 菜单分析 API（GPT-4o Vision）
│   │   └── generate/
│   │       └── route.ts      # 图片生成 API（DALL-E 3 / Nano Banana Pro）
│   ├── page.tsx              # 主页面组件
│   ├── layout.tsx            # 布局组件
│   └── globals.css           # 全局样式
├── public/                   # 静态资源
├── .env.local               # 环境变量配置（需要创建）
├── package.json             # 依赖配置
└── README.md               # 本文件
```

---

## 使用示例

1. **准备菜单图片**
   - 可以是手写菜单、印刷菜单、菜单截图等
   - 支持常见图片格式（JPG、PNG 等）

2. **上传并分析**
   - 点击上传按钮，选择菜单图片
   - 等待 GPT-4o Vision 分析（通常 10-20 秒）

3. **查看识别结果**
   - 页面显示识别出的菜品列表
   - 每个菜品显示：名称、价格、描述

4. **自动生成图片**
   - 系统自动为每个菜品生成美食图片
   - 实时显示生成进度和状态
   - 图片生成完成后立即显示

---

## 性能优化

### 已实现的优化

- ✅ **并行处理**: 多张图片同时生成，减少总时间
- ✅ **快速失败**: Nano Banana Pro 失败时快速切换到 DALL-E 3
- ✅ **实时反馈**: 进度条和状态标识，让用户了解处理进度
- ✅ **错误隔离**: 单个菜品失败不影响其他菜品

---

## License

MIT


# 🍽️ AI Menu Generator (Localhost MVP)

> 一个基于 AI 的菜单生成器，上传菜单图片，自动解析菜品并生成相关的美食照片。


## Features 
* **Vision Parsing**: 使用 GPT-4o 自动识别上传的菜单图片（支持手写、截图）。
* **AI Imaging**: 使用 DALL-E 3 根据菜名和描述自动生成图片。
* **Instant UI**: 响应式网页界面，实时展示生成进度。

## Tech Stack
* **Framework**: Next.js 14+ (App Router)
* **Styling**: Tailwind CSS
* **AI Models**: OpenAI GPT-4o (Vision) & DALL-E 3 (Image Generation)

## Getting Started 

### Prerequisites
* Node.js (v18 or higher)
* OpenAI API Key (需支持 GPT-4o 和 DALL-E 3)

### Installation

1.  **Clone the repo**
    ```bash
    git clone https://github.com/Siyu-H/menugen-local.git
    cd menugen-local
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    * 在根目录创建一个名为 `.env.local` 的文件。
    * 填入你的 OpenAI API Key：
    ```env
    OPENAI_API_KEY=sk-proj-your-api-key-here
    ```

4.  **Run the App**
    ```bash
    npm run dev
    ```

5.  **Use it**
    * 打开浏览器访问 [http://localhost:3000](http://localhost:3000)。
    * 点击上传按钮选择一张菜单图片即可。


## 📄 License
MIT
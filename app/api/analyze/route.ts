import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// 初始化 OpenAI 客户端
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    // 1. 读取前端发来的 JSON 数据
    const body = await req.json();
    const { image } = body; // 这里是图片的 Base64 编码

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // 2. 调用 GPT-4o Vision 模型
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "你是一个专业的菜单识别助手。请分析这张图片，提取所有的菜品信息。请直接返回 JSON 格式数据，不要使用 Markdown 代码块。JSON结构必须包含 'menu_items' 数组，每个元素包含 'name' (菜名), 'description' (根据菜名生成的英文视觉描述，用于AI绘画，比如 'delicious burger with cheese, photorealistic, 8k'), 'price' (价格)。" 
            },
            { 
              type: "image_url", 
              image_url: { url: image } 
            },
          ],
        },
      ],
      response_format: { type: "json_object" }, // 强制返回 JSON
    });

    // 3. 解析并返回结果
    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content from OpenAI");
    
    const data = JSON.parse(content);
    // 添加模型信息到响应
    return NextResponse.json({ ...data, model: 'GPT-4o Vision' });

  } catch (error) {
    console.error("Analyze Error:", error);
    return NextResponse.json({ error: "Failed to analyze menu" }, { status: 500 });
  }
}
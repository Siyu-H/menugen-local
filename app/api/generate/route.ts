import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 从环境变量读取使用的模型（默认使用 DALL-E 3）
const IMAGE_MODEL = process.env.IMAGE_GENERATE_MODEL || 'dall-e-3';

export async function POST(req: Request) {
  try {
    const { description } = await req.json();

    if (!description) {
      return NextResponse.json({ error: "No description provided" }, { status: 400 });
    }

    // 根据配置选择使用哪个模型
    let result: { url: string; model?: string; attemptedModel?: string };
    let modelName: string;
    let attemptedModel: string | undefined;
    
    if (IMAGE_MODEL === 'nano-banana-pro') {
      attemptedModel = 'Nano Banana Pro';
      try {
        result = await generateWithNanoBananaPro(description);
        modelName = 'Nano Banana Pro';
      } catch (nanoError) {
        // 如果 Nano Banana Pro 失败，自动降级到 DALL-E 3
        const errorMsg = nanoError instanceof Error ? nanoError.message : 'Unknown error';
        console.warn(`Nano Banana Pro failed (${errorMsg}), falling back to DALL-E 3...`);
        result = await generateWithDALLE3(description);
        modelName = 'DALL-E 3 (fallback)';
      }
    } else {
      result = await generateWithDALLE3(description);
      modelName = 'DALL-E 3';
    }
    
    return NextResponse.json({ ...result, model: modelName, attemptedModel });

  } catch (error) {
    console.error("Generate Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate image";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// 使用 DALL-E 3 生成图片
async function generateWithDALLE3(description: string): Promise<{ url: string }> {
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: `Professional food photography, appetizing, high resolution, soft lighting: ${description}`,
    n: 1,
    size: "1024x1024",
    quality: "standard",
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error("DALL-E 3 did not return an image URL");
  }
  return { url: imageUrl };
}

// 使用 Nano Banana Pro 生成图片（直接调用 Google API）
async function generateWithNanoBananaPro(description: string): Promise<{ url: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set in environment variables");
  }

  // 构建 prompt（针对美食摄影优化）
  const prompt = `Professional food photography, ultra realistic, 8k resolution, appetizing, studio lighting, shallow depth of field, high dynamic range, on dark background, no text, no watermark: ${description}`;

  try {
    // 使用 Google Gemini 3 Pro Image (Nano Banana Pro)
    // 模型: gemini-3-pro-image-preview
    // 方法: generateContent (不是 predict)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt,
            }],
          }],
          generationConfig: {
            temperature: 1.0,
            topK: 32,
            topP: 1.0,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Imagen API error:", response.status, errorText);
      throw new Error(`Google Imagen API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("Google Gemini API response:", JSON.stringify(data, null, 2));

    // Gemini generateContent 返回格式:
    // data.candidates[0].content.parts[0].inlineData.data (base64)
    // 或 data.candidates[0].content.parts[0].text (如果有文本)
    
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 检查是否有图片数据
          if (part.inlineData && part.inlineData.data) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            return { url: `data:${mimeType};base64,${part.inlineData.data}` };
          }
          // 检查是否有图片 URL
          if (part.url) {
            return { url: part.url };
          }
        }
      }
    }

    // 备用：检查其他可能的响应格式
    if (data.generatedImages && data.generatedImages.length > 0) {
      const image = data.generatedImages[0];
      if (image.base64String) {
        return { url: `data:image/png;base64,${image.base64String}` };
      }
      if (image.url) {
        return { url: image.url };
      }
    }

    throw new Error("Google Gemini API 响应格式异常，无法提取图片。响应: " + JSON.stringify(data).substring(0, 500));

  } catch (error) {
    console.error("Google Imagen API Error:", error);
    throw error;
  }
}
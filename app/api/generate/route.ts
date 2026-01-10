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
  // 注意：在 prompt 中明确指定图片尺寸为 1024x1024（1:1 比例），与 DALL-E 3 保持一致
  const prompt = `Professional food photography, ultra realistic, 8k resolution, appetizing, studio lighting, shallow depth of field, high dynamic range, on dark background, no text, no watermark, square format 1024x1024 pixels: ${description}`;

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
            maxOutputTokens: 8192,  // 增加 token 限制（1024 不够用于图片生成）
            // 尝试添加图片尺寸相关配置
            // 注意：Gemini API 可能不支持这些参数，如果报错需要移除
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Imagen API error:", response.status, errorText);
      
      // 尝试解析错误详情
      let errorMessage = `Google Imagen API error: ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage += ` - ${errorData.error.message}`;
        } else {
          errorMessage += ` - ${errorText.substring(0, 200)}`;
        }
      } catch {
        errorMessage += ` - ${errorText.substring(0, 200)}`;
      }
      
      // 根据状态码提供更详细的错误信息
      if (response.status === 429) {
        errorMessage += " (请求过多，请稍后重试)";
      } else if (response.status === 503) {
        errorMessage += " (服务暂时不可用，请稍后重试)";
      } else if (response.status === 403) {
        errorMessage += " (权限不足或 API 未启用)";
      } else if (response.status === 401) {
        errorMessage += " (API 密钥无效)";
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // 只记录响应摘要，不输出完整的 base64 图片数据（避免 terminal 被刷屏）
    const responseSummary = {
      hasCandidates: !!data.candidates,
      candidateCount: data.candidates?.length || 0,
      hasContent: !!data.candidates?.[0]?.content,
      partsCount: data.candidates?.[0]?.content?.parts?.length || 0,
      finishReason: data.candidates?.[0]?.finishReason || 'N/A',
      hasInlineData: !!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data,
      inlineDataSize: data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data?.length || 0,
      error: data.error || null
    };
    console.log("Google Gemini API response summary:", JSON.stringify(responseSummary, null, 2));

    // Gemini generateContent 返回格式:
    // data.candidates[0].content.parts[0].inlineData.data (base64)
    // 或 data.candidates[0].content.parts[0].text (如果有文本)
    
    // 检查是否有错误信息（即使 HTTP 200）
    if (data.error) {
      console.error("Google Gemini API returned error in response:", data.error);
      throw new Error(`Google Gemini API error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // 检查是否被安全过滤拒绝
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      
      // 检查是否有安全过滤原因或其他问题
      if (candidate.finishReason) {
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
          console.warn("Content was blocked by safety filter, finishReason:", candidate.finishReason);
          throw new Error("内容被安全过滤器拒绝，请尝试修改描述");
        }
        if (candidate.finishReason === 'MAX_TOKENS') {
          console.warn("Response truncated due to MAX_TOKENS limit, finishReason:", candidate.finishReason);
          // 如果 content 为空，说明 token 不够用
          if (!candidate.content || Object.keys(candidate.content).length === 0) {
            throw new Error("Token 限制不足，无法生成完整图片。请尝试更短的描述或增加 maxOutputTokens");
          }
          // 如果有 content 但可能不完整，尝试继续处理
        }
      }
      
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 检查是否有图片数据
          if (part.inlineData && part.inlineData.data) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            const dataLength = part.inlineData.data.length;
            console.log(`✅ Image generated successfully (${mimeType}, base64 size: ${dataLength} chars)`);
            return { url: `data:${mimeType};base64,${part.inlineData.data}` };
          }
          // 检查是否有图片 URL
          if (part.url) {
            return { url: part.url };
          }
          // 如果返回的是文本而不是图片
          if (part.text) {
            console.warn("API returned text instead of image:", part.text.substring(0, 100));
            throw new Error("API 返回了文本而非图片，可能是 prompt 无法生成图像");
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

    // 如果没有任何图片数据，记录详细的响应信息
    console.error("Unable to extract image from response:", JSON.stringify(data, null, 2));
    throw new Error("Google Gemini API 响应格式异常，无法提取图片。响应: " + JSON.stringify(data).substring(0, 500));

  } catch (error) {
    console.error("Google Imagen API Error:", error);
    throw error;
  }
}
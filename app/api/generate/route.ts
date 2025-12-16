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

  const imageUrl = response.data[0]?.url;
  if (!imageUrl) {
    throw new Error("DALL-E 3 did not return an image URL");
  }
  return { url: imageUrl };
}

// 使用 Nano Banana Pro 生成图片（通过 NetMind AI）
async function generateWithNanoBananaPro(description: string): Promise<{ url: string }> {
  const apiKey = process.env.NANO_BANANA_PRO_API_KEY;
  
  if (!apiKey) {
    throw new Error("NANO_BANANA_PRO_API_KEY is not set in environment variables");
  }

  // 构建 prompt（针对美食摄影优化）
  const prompt = `Professional food photography, ultra realistic, 8k resolution, appetizing, studio lighting, shallow depth of field, high dynamic range, on dark background, no text, no watermark: ${description}`;

  try {
    // 步骤 1: 提交生成任务
    const response = await fetch('https://api.netmind.ai/v1/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "google/nano-banana-pro",
        config: {
          prompt: prompt,
          // image_urls: [], // 可选：如果需要参考图片，可以在这里添加
          aspect_ratio: "auto",
          output_format: "png",
          resolution: "1K", // 可选: "1K", "2K", "4K" 等
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nano Banana Pro API error: ${response.status} - ${errorText}`);
    }

    const taskData = await response.json();
    console.log("Nano Banana Pro Task Created:", JSON.stringify(taskData, null, 2));
    
    // 步骤 2: 检查任务状态
    const taskId = taskData.id;
    if (!taskId) {
      throw new Error("No task ID in response");
    }

    // 如果状态已经是完成状态，直接返回结果
    if (taskData.status === 'completed' || taskData.status === 'success') {
      return extractImageUrl(taskData);
    }

    // 步骤 3: 轮询任务状态（最多等待 60 秒，但如果检测到认证错误则快速失败）
    const maxAttempts = 30; // 最多轮询 30 次
    const pollInterval = 2000; // 每 2 秒轮询一次
    const earlyFailureAttempts = 5; // 前 5 次检查更频繁，以便快速检测认证错误
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // 前几次检查间隔更短，以便快速发现认证错误
      const currentInterval = attempt < earlyFailureAttempts ? pollInterval : pollInterval;
      await new Promise(resolve => setTimeout(resolve, currentInterval));
      
      const statusResponse = await fetch(`https://api.netmind.ai/v1/generation/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`Failed to check task status: ${statusResponse.status} - ${errorText}`);
      }

      const statusData = await statusResponse.json();
      console.log(`Task ${taskId} status (attempt ${attempt + 1}):`, statusData.status);
      
      // 提前检查错误日志，如果发现认证错误立即失败（避免等待 60 秒）
      if (statusData.logs && Array.isArray(statusData.logs) && statusData.logs.length > 0) {
        const errorLogs = statusData.logs.filter((log: any) => 
          log.text && (
            log.text.toLowerCase().includes('error') || 
            log.text.toLowerCase().includes('failed') ||
            log.text.toLowerCase().includes('invalid')
          )
        );
        
        if (errorLogs.length > 0) {
          const errorMessage = errorLogs[0].text;
          
          // 如果是认证错误，立即失败，不要继续等待
          if (errorMessage.includes('account not found') || errorMessage.includes('invalid_grant')) {
            console.error("Early failure detected: authentication error in logs");
            throw new Error("API 认证失败：账户未找到或 API Key 无效。请检查 NetMind AI API Key 是否正确。");
          } else if (errorMessage.includes('backend job failed') && attempt >= earlyFailureAttempts) {
            // 如果是后端错误且已经检查了几次，也提前失败
            console.error("Early failure detected: backend job failed");
            throw new Error("后端服务错误：NetMind AI 服务暂时不可用，请稍后重试。");
          }
        }
      }
      
      // 详细记录响应数据以便调试
      if (statusData.status === 'completed' || statusData.status === 'success') {
        console.log(`Task ${taskId} completed. Result keys:`, Object.keys(statusData.result || {}));
        
        // 如果 result 是空的，再等待一次看看
        if (!statusData.result || Object.keys(statusData.result || {}).length === 0) {
          console.log(`Task ${taskId} completed but result is empty, waiting 3 more seconds and retrying...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // 再次查询
          const retryResponse = await fetch(`https://api.netmind.ai/v1/generation/${taskId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
            },
          });
          
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            console.log(`Retry check - status: ${retryData.status}, result keys:`, Object.keys(retryData.result || {}));
            if (retryData.result && Object.keys(retryData.result).length > 0) {
              console.log(`Retry successful! Full response:`, JSON.stringify(retryData, null, 2));
              return extractImageUrl(retryData);
            }
          }
        }
        
        console.log(`Task ${taskId} full response:`, JSON.stringify(statusData, null, 2));
        return extractImageUrl(statusData);
      }

      if (statusData.status === 'failed' || statusData.status === 'error') {
        // 如果失败且有错误信息，提供更详细的错误
        const errorMsg = statusData.error || 'Unknown error';
        throw new Error(`Task failed: ${errorMsg}`);
      }

      // 继续等待...
    }

    throw new Error(`Task timeout: task ${taskId} did not complete within ${maxAttempts * pollInterval / 1000} seconds`);

  } catch (error) {
    console.error("Nano Banana Pro API Error:", error);
    throw error;
  }
}

// 从任务结果中提取图片 URL
function extractImageUrl(taskData: any): { url: string } {
  // 首先检查是否有错误日志
  if (taskData.logs && Array.isArray(taskData.logs) && taskData.logs.length > 0) {
    const errorLogs = taskData.logs.filter((log: any) => 
      log.text && (
        log.text.toLowerCase().includes('error') || 
        log.text.toLowerCase().includes('failed') ||
        log.text.toLowerCase().includes('invalid')
      )
    );
    
    if (errorLogs.length > 0) {
      const errorMessage = errorLogs[0].text;
      console.error("Task completed with errors in logs:", errorMessage);
      
      // 提取更友好的错误信息
      if (errorMessage.includes('account not found') || errorMessage.includes('invalid_grant')) {
        throw new Error("API 认证失败：账户未找到或 API Key 无效。请检查 NetMind AI API Key 是否正确。");
      } else if (errorMessage.includes('backend job failed')) {
        throw new Error("后端服务错误：NetMind AI 服务暂时不可用，请稍后重试。");
      } else {
        throw new Error(`生成失败：${errorMessage.substring(0, 200)}`);
      }
    }
  }
  
  const result = taskData.result || {};
  
  // 详细记录 result 结构
  console.log('Extracting image URL. Result keys:', Object.keys(result));
  console.log('Result structure:', JSON.stringify(result, null, 2));
  
  // 如果 result 是空对象，可能需要等待更长时间，或者任务实际失败了
  if (Object.keys(result).length === 0 && taskData.status === 'completed') {
    // 检查是否有错误日志
    if (taskData.logs && taskData.logs.length > 0) {
      const errorInfo = taskData.logs[0].text;
      console.error('Task completed with empty result but has logs:', errorInfo);
      throw new Error(`生成失败：${errorInfo.substring(0, 200)}`);
    }
    // 如果没有错误日志，可能是结果还没准备好，需要再等一会儿
    console.warn('Task marked as completed but result is empty. This might be a timing issue.');
    throw new Error('生成失败：任务完成但结果为空。可能需要等待更长时间，或服务端处理异常。');
  }
  
  // 尝试多种可能的字段名（根据实际 API 响应，图片在 result.data[0].url）
  const imageUrl = 
    result.data?.[0]?.url ||           // NetMind AI 的实际格式
    result.data?.url ||                // 备用格式
    result.data?.[0]?.image_url ||      // 备用格式
    result.image_url || 
    result.url || 
    result.image || 
    result.output_url ||
    result.output ||
    taskData.image_url ||
    taskData.url;
  
  // 检查 base64 图片
  if (result.image_base64 || taskData.image_base64 || result.data?.image_base64) {
    const base64Data = result.image_base64 || taskData.image_base64 || result.data?.image_base64;
    const base64Image = `data:image/png;base64,${base64Data}`;
    return { url: base64Image };
  }
  
  if (!imageUrl) {
    console.error("Task result (no URL found):", JSON.stringify(taskData, null, 2));
    const availableKeys = Object.keys(result).length > 0 
      ? Object.keys(result).join(', ')
      : 'result 为空';
    throw new Error(`无法从任务结果中提取图片 URL。可用字段：${availableKeys}。请检查 NetMind AI API 文档。`);
  }

  return { url: imageUrl };
}
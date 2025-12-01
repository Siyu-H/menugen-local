import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { description } = await req.json();

    if (!description) {
      return NextResponse.json({ error: "No description provided" }, { status: 400 });
    }

    // 调用 DALL-E 3
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Professional food photography, appetizing, high resolution, soft lighting: ${description}`,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });

    const imageUrl = response.data[0]?.url;
    return NextResponse.json({ url: imageUrl });

  } catch (error) {
    console.error("Generate Error:", error);
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 });
  }
}
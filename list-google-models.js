/**
 * 列出 Google API 可用的模型
 */

const API_KEY = process.env.GOOGLE_API_KEY || process.argv[2];

if (!API_KEY) {
  console.error('❌ 错误: 请提供 GOOGLE_API_KEY');
  process.exit(1);
}

async function listModels() {
  console.log('🔍 正在列出可用的模型...\n');
  
  try {
    // 尝试列出模型
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ 获取模型列表失败:');
      console.log(`状态码: ${response.status}`);
      console.log(`错误: ${errorText}`);
      return;
    }

    const data = await response.json();
    
    console.log('✅ 可用模型列表:\n');
    
    if (data.models && data.models.length > 0) {
      // 查找图像生成相关的模型
      const imageModels = data.models.filter((model) => 
        model.name && (
          model.name.toLowerCase().includes('imagen') ||
          model.name.toLowerCase().includes('image') ||
          model.name.toLowerCase().includes('generation')
        )
      );

      if (imageModels.length > 0) {
        console.log('🎨 图像生成相关模型:');
        imageModels.forEach((model) => {
          console.log(`  - ${model.name}`);
          if (model.supportedGenerationMethods) {
            console.log(`    支持的方法: ${model.supportedGenerationMethods.join(', ')}`);
          }
          if (model.displayName) {
            console.log(`    显示名称: ${model.displayName}`);
          }
          console.log('');
        });
      } else {
        console.log('⚠️  未找到图像生成相关的模型');
        console.log('\n所有模型:');
        data.models.slice(0, 20).forEach((model) => {
          console.log(`  - ${model.name}`);
        });
      }
    } else {
      console.log('未找到模型');
    }

  } catch (error) {
    console.error('❌ 错误:', error);
  }
}

listModels();

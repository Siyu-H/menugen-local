/**
 * Google Imagen API 测试工具
 * 用于验证 Google API Key 是否可以调用 Imagen (Nano Banana Pro)
 */

const API_KEY = process.env.GOOGLE_API_KEY || process.argv[2];

if (!API_KEY) {
  console.error('❌ 错误: 请提供 GOOGLE_API_KEY');
  console.log('\n使用方法:');
  console.log('  1. 设置环境变量: export GOOGLE_API_KEY=your-key');
  console.log('  2. 或作为参数: node test-google-api.js your-api-key');
  console.log('  3. 或在项目根目录运行: GOOGLE_API_KEY=your-key node test-google-api.js');
  process.exit(1);
}

console.log('🔍 Google Imagen API 测试工具\n');
console.log('API Key 前缀:', API_KEY.substring(0, 10) + '...' + API_KEY.substring(API_KEY.length - 5));
console.log('API Key 长度:', API_KEY.length);
console.log('');

// 测试函数
async function testGoogleImagenAPI() {
  console.log('📋 开始测试...\n');
  
  // 测试不同的 API 端点
  const endpoints = [
    {
      name: 'Imagen 3.0 (推荐)',
      url: `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${API_KEY}`,
      body: {
        prompt: "a simple red apple on white background",
        number_of_images: 1,
        aspect_ratio: "1:1",
        safety_filter_level: "block_some",
        person_generation: "allow_all",
      }
    },
    {
      name: 'Vertex AI Imagen (备选)',
      url: `https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/us-central1/publishers/google/models/imagen-3.0-generate-001:predict?key=${API_KEY}`,
      body: {
        prompt: "a simple red apple on white background",
        number_of_images: 1,
      },
      skip: true // 这个需要 PROJECT_ID，先跳过
    }
  ];

  for (const endpoint of endpoints) {
    if (endpoint.skip) {
      console.log(`⏭️  跳过: ${endpoint.name} (需要额外配置)`);
      continue;
    }

    console.log(`📡 测试端点: ${endpoint.name}`);
    console.log(`   URL: ${endpoint.url.split('?')[0]}`);
    
    try {
      const startTime = Date.now();
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(endpoint.body),
      });

      const elapsed = Date.now() - startTime;
      console.log(`   响应时间: ${elapsed}ms`);
      console.log(`   状态码: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`   ❌ 请求失败`);
        
        // 尝试解析错误信息
        try {
          const errorData = JSON.parse(errorText);
          console.log(`   错误详情:`, JSON.stringify(errorData, null, 2));
          
          // 检查常见错误
          if (errorData.error) {
            const error = errorData.error;
            console.log(`\n   🔍 错误分析:`);
            console.log(`   错误代码: ${error.code || 'N/A'}`);
            console.log(`   错误消息: ${error.message || 'N/A'}`);
            
            if (error.message && error.message.includes('billing')) {
              console.log(`\n   🔴 问题诊断: 需要启用计费功能`);
              console.log(`   解决方案:`);
              console.log(`   1. 访问 Google Cloud Console`);
              console.log(`   2. 设置结算账号并绑定信用卡`);
              console.log(`   3. 确保项目已关联到结算账号`);
            } else if (error.message && error.message.includes('permission') || error.message.includes('not enabled')) {
              console.log(`\n   🔴 问题诊断: API 未启用或权限不足`);
              console.log(`   解决方案:`);
              console.log(`   1. 访问 https://console.cloud.google.com/apis/library`);
              console.log(`   2. 搜索并启用 "Vertex AI API" 或 "Imagen API"`);
            } else if (error.message && error.message.includes('quota')) {
              console.log(`\n   🟡 问题诊断: 配额不足或限制`);
              console.log(`   解决方案:`);
              console.log(`   1. 检查 Google Cloud Console 中的配额设置`);
              console.log(`   2. 确认 API 已启用并有权访问`);
            }
          }
        } catch (parseError) {
          console.log(`   错误响应 (文本):`, errorText.substring(0, 200));
        }
        
        return false;
      }

      const data = await response.json();
      console.log(`   ✅ 请求成功！`);
      console.log(`   响应数据结构:`, Object.keys(data));
      
      // 检查响应格式
      if (data.generatedImages) {
        console.log(`   ✅ 找到 generatedImages 字段`);
        if (data.generatedImages.length > 0) {
          const image = data.generatedImages[0];
          console.log(`   图片格式:`, Object.keys(image));
          if (image.base64String) {
            console.log(`   ✅ 图片数据: Base64 (${image.base64String.length} 字符)`);
          }
          if (image.url) {
            console.log(`   ✅ 图片 URL: ${image.url}`);
          }
        }
      } else {
        console.log(`   ⚠️  响应格式可能不同，完整响应:`, JSON.stringify(data, null, 2).substring(0, 500));
      }

      console.log(`\n✅ ${endpoint.name} 测试通过！`);
      return true;

    } catch (error) {
      console.log(`   ❌ 测试异常: ${error.message}`);
      if (error.message.includes('fetch')) {
        console.log(`   💡 可能是网络问题或 URL 不正确`);
      }
      return false;
    }
  }

  return false;
}

// 运行测试
testGoogleImagenAPI().then(success => {
  if (success) {
    console.log('\n✨ API Key 可以正常使用！');
    console.log('\n💡 下一步:');
    console.log('   1. 在 .env.local 中设置 GOOGLE_API_KEY');
    console.log('   2. 设置 IMAGE_GENERATE_MODEL=nano-banana-pro');
    console.log('   3. 重启开发服务器并测试');
    process.exit(0);
  } else {
    console.log('\n❌ API Key 测试失败，请根据上述诊断结果进行修复');
    process.exit(1);
  }
}).catch(error => {
  console.error('\n💥 测试过程出错:', error);
  process.exit(1);
});

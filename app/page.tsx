'use client';

import { useState } from 'react';

// 定义数据结构
type MenuItem = {
  name: string;
  description: string;
  price: string;
  imageUrl?: string;
  imageStatus?: 'waiting' | 'generating' | 'completed' | 'failed';
  imageError?: string;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatus('正在分析菜单图片...');
    setMenuItems([]);
    setCurrentModel('');
    setProgress({ completed: 0, total: 0 });

    // 将图片转换为 Base64 格式
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Image = event.target?.result as string;
      
      try {
        // 1. 发送图片到后端进行分析
        const res = await fetch('/api/analyze', {
          method: 'POST',
          body: JSON.stringify({ image: base64Image }),
        });
        
        if (!res.ok) throw new Error('Analysis failed');
        
        const data = await res.json();
        const items: MenuItem[] = (data.menu_items || []).map((item: MenuItem) => ({
          ...item,
          imageStatus: 'waiting' as const,
        }));
        const analyzeModel = data.model || 'GPT-4o Vision';
        setCurrentModel(analyzeModel);
        setMenuItems(items);
        setProgress({ completed: 0, total: items.length });
        
        // 2. 开始并行生成图片
        setStatus(`识别成功！共 ${items.length} 道菜 (使用 ${analyzeModel})。正在生成美食图片...`);
        generateImagesInParallel(items);

      } catch (err) {
        console.error(err);
        setStatus('出错了，请重试（可能是图片太大或网络问题）');
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 并行生成图片（分批处理，控制并发数避免 API 限流）
  const generateImagesInParallel = async (items: MenuItem[]) => {
    const CONCURRENT_LIMIT = 3; // 最多同时处理 3 张图片
    const newItems = [...items];
    
    // 更新单个项目的状态和进度
    const updateItemStatus = (index: number, updates: Partial<MenuItem>) => {
      newItems[index] = { ...newItems[index], ...updates };
      setMenuItems([...newItems]);
      
      // 更新进度（基于实际完成状态）
      const completed = newItems.filter(item => 
        item.imageStatus === 'completed' || item.imageStatus === 'failed'
      ).length;
      setProgress({ completed, total: items.length });
      
      return completed;
    };
    
    // 生成单张图片的函数
    const generateSingleImage = async (index: number) => {
      const item = newItems[index];
      
      // 更新状态为生成中
      updateItemStatus(index, { imageStatus: 'generating' });
      const generatingCount = newItems.filter(item => 
        item.imageStatus === 'generating' || item.imageStatus === 'completed'
      ).length;
      setStatus(`正在生成 (${generatingCount}/${items.length}): ${item.name}...`);
      
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          body: JSON.stringify({ description: item.description }),
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }
        
        const data = await res.json();
        
        // 更新当前使用的模型（如果响应中包含）
        if (data.model) {
          setCurrentModel(prev => {
            const imageModel = data.model;
            const analyzeModel = prev.split(' → ')[0] || 'GPT-4o Vision';
            
            // 如果尝试了 Nano Banana Pro 但失败了（显示为 fallback）
            if (data.attemptedModel && data.attemptedModel !== imageModel && imageModel.includes('fallback')) {
              // 显示完整的尝试过程：GPT-4o Vision → Nano Banana Pro (尝试失败) → DALL-E 3
              return `${analyzeModel} → ${data.attemptedModel} (尝试失败) → DALL-E 3`;
            }
            
            // 如果成功使用 Nano Banana Pro
            if (data.attemptedModel && data.attemptedModel === imageModel) {
              return `${analyzeModel} → ${imageModel}`;
            }
            
            // 如果之前没有设置，或者当前是 fallback，更新显示
            if (!prev || prev.includes('fallback') || !prev.includes('→')) {
              return `${analyzeModel} → ${imageModel}`;
            }
            
            // 如果已经显示了尝试过程，更新最终结果
            if (prev.includes('尝试失败') || prev.includes('尝试中')) {
              return prev.replace(/尝试(失败|中).*$/, imageModel);
            }
            
            return prev;
          });
        }
        
        if (data.url) {
          const completed = updateItemStatus(index, {
            imageUrl: data.url,
            imageStatus: 'completed',
          });
          setStatus(`✅ 已完成 ${completed}/${items.length} 张图片`);
        } else {
          console.error(`No URL in response for ${item.name}:`, data);
          throw new Error('响应格式错误：未找到图片 URL');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Failed to generate image for ${item.name}:`, errorMsg);
        const completed = updateItemStatus(index, {
          imageStatus: 'failed',
          imageError: errorMsg,
        });
        setStatus(`⚠️ ${item.name} 生成失败，继续处理其他图片... (${completed}/${items.length})`);
      }
    };
    
    // 分批并行处理
    for (let i = 0; i < newItems.length; i += CONCURRENT_LIMIT) {
      const batch = newItems.slice(i, i + CONCURRENT_LIMIT);
      await Promise.all(
        batch.map((_, batchIndex) => generateSingleImage(i + batchIndex))
      );
    }
    
    // 所有图片处理完成
    const successCount = newItems.filter(item => item.imageStatus === 'completed').length;
    const failedCount = newItems.filter(item => item.imageStatus === 'failed').length;
    
    if (failedCount === 0) {
      setStatus(`✨ 全部完成！成功生成 ${successCount} 张图片`);
    } else {
      setStatus(`⚠️ 处理完成！成功 ${successCount} 张，失败 ${failedCount} 张`);
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-neutral-100 p-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-6 text-neutral-800">
          🍽️ AI Menu Generator
        </h1>
        
        {/* 上传按钮区域 */}
        <div className="bg-white p-6 rounded-xl shadow-sm mb-8 text-center border border-neutral-200">
          <input 
            type="file" 
            id="fileInput"
            accept="image/*" 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <label 
            htmlFor="fileInput" 
            className={`inline-block px-6 py-3 rounded-lg text-white font-medium cursor-pointer transition ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-black hover:bg-gray-800'
            }`}
          >
            {loading ? '处理中...' : '📷 上传菜单照片 / 截图'}
          </label>
          <div className="mt-4">
            <p className="text-sm text-neutral-500 min-h-[20px]">
              {status}
            </p>
            {currentModel && (
              <span className="block mt-1 text-xs text-neutral-400">
                当前模型: {currentModel}
              </span>
            )}
            {loading && progress.total > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>进度</span>
                  <span>{progress.completed} / {progress.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-black h-full transition-all duration-300 ease-out"
                    style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 菜单列表展示 */}
        <div className="space-y-6">
          {menuItems.map((item, index) => (
            <div key={index} className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col sm:flex-row border border-neutral-100">
              {/* 左侧：图片 */}
              <div className="sm:w-1/3 h-48 sm:h-auto bg-gray-200 relative shrink-0 overflow-hidden">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm p-4">
                    {item.imageStatus === 'waiting' && (
                      <>
                        <div className="text-2xl mb-2">⏳</div>
                        <div>等待生成</div>
                      </>
                    )}
                    {item.imageStatus === 'generating' && (
                      <>
                        <div className="text-2xl mb-2 animate-pulse">🎨</div>
                        <div>正在生成...</div>
                        {currentModel.includes('Nano Banana Pro') && (
                          <div className="text-xs mt-1 text-gray-400">可能需要 10-60 秒</div>
                        )}
                      </>
                    )}
                    {item.imageStatus === 'failed' && (
                      <>
                        <div className="text-2xl mb-2">❌</div>
                        <div className="text-red-500">生成失败</div>
                        {item.imageError && (
                          <div className="text-xs mt-1 text-red-400 text-center max-w-full truncate">
                            {item.imageError}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {/* 状态标识 */}
                {item.imageStatus && item.imageStatus !== 'completed' && (
                  <div className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm rounded-full px-2 py-1 text-xs">
                    {item.imageStatus === 'waiting' && '⏳ 等待'}
                    {item.imageStatus === 'generating' && '🎨 生成中'}
                    {item.imageStatus === 'failed' && '❌ 失败'}
                  </div>
                )}
              </div>
              
              {/* 右侧：文字 */}
              <div className="p-6 flex flex-col justify-center flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-xl font-bold text-gray-800">{item.name}</h2>
                  <span className="text-lg font-semibold text-green-600 ml-4">{item.price}</span>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
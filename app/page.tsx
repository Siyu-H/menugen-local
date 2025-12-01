'use client';

import { useState } from 'react';

// 定义数据结构
type MenuItem = {
  name: string;
  description: string;
  price: string;
  imageUrl?: string;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatus('正在分析菜单图片 (GPT-4o Vision)...');
    setMenuItems([]);

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
        const items = data.menu_items || [];
        setMenuItems(items);
        
        // 2. 开始逐个生成图片
        setStatus(`识别成功！共 ${items.length} 道菜。正在生成美食图片...`);
        generateImagesSequentially(items);

      } catch (err) {
        console.error(err);
        setStatus('出错了，请重试（可能是图片太大或网络问题）');
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 逐个生成图片（串行处理，避免并发过高）
  const generateImagesSequentially = async (items: MenuItem[]) => {
    const newItems = [...items];
    
    for (let i = 0; i < newItems.length; i++) {
      setStatus(`正在生成图片 (${i + 1}/${newItems.length}): ${newItems[i].name}...`);
      
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          body: JSON.stringify({ description: newItems[i].description }),
        });
        const data = await res.json();
        
        if (data.url) {
          newItems[i].imageUrl = data.url;
          setMenuItems([...newItems]); // 实时更新界面
        }
      } catch (err) {
        console.error(`Skipping image for ${newItems[i].name}`);
      }
    }
    
    setStatus('✨ 全部完成！');
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
          <p className="mt-4 text-sm text-neutral-500 min-h-[20px]">{status}</p>
        </div>

        {/* 菜单列表展示 */}
        <div className="space-y-6">
          {menuItems.map((item, index) => (
            <div key={index} className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col sm:flex-row border border-neutral-100">
              {/* 左侧：图片 */}
              <div className="sm:w-1/3 h-48 sm:h-auto bg-gray-200 relative shrink-0">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    {loading ? '绘制中...' : '等待生成'}
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
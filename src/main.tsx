import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import './index.css'

// 确保在移动设备上有更好的交互体验
document.documentElement.setAttribute('data-theme', 'light');
document.documentElement.setAttribute('data-color-mode', 'light');

// 为防止iOS等移动设备上的双击缩放
document.documentElement.addEventListener('touchstart', function(event) {
  if (event.touches.length > 1) {
    event.preventDefault();
  }
}, { passive: false });

// 设置Ant Design的兼容模式
ConfigProvider.config({
  theme: {
    components: {
      Button: {
        colorPrimary: '#722ed1',
      },
    },
  },
});

console.log('已启用 Ant Design 与 React 19 的兼容模式');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 4,
        },
        components: {
          Button: {
            colorPrimary: '#722ed1',
          },
        },
      }}
      componentSize="middle"
      space={{
        size: 'middle'
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)

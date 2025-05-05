import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 代理到Silicon Flow API的请求
      '/api/silicon': {
        target: 'https://api.siliconflow.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/silicon/, ''),
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('代理错误', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('代理请求', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('代理响应', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
})

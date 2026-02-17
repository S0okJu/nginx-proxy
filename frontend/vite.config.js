import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 루트 기준 절대 경로. /share/{token} 에서도 /assets/*.js 가 동일 경로로 요청되어
  // nginx가 index.html 대신 실제 JS를 서빙하도록 함 (MIME type 오류 방지)
  base: '/',
})

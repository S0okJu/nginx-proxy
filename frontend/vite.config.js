import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Object Storage/CDN 서브경로에서 서비스해도 JS/CSS 로딩되도록 상대 경로 사용
  base: './',
})

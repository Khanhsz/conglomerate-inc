import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Đường dẫn asset tương đối: bản build chạy được ở thư mục con (artifact, GitHub Pages…).
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
});

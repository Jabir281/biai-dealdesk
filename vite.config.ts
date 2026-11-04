import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { localDraftApi } from './server/vite-ai.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localDraftApi()],
})

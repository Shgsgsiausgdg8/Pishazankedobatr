import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    hmr: false,
    watch: {
        ignored: ['**/history.sqlite', '**/*.sqlite', '**/node_modules/**', '**/dist/**']
    }
  },
  base: '/signalpanel/'
});

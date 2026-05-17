import { defineConfig } from 'vite';

export default defineConfig({
  base: '/eurolobby/',
  root: '.',
  server: { port: 5173, open: true },
});

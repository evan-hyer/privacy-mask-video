import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  publicDir: false,
  server: { open: '/demo/index.html' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        define: fileURLToPath(new URL('./src/define.ts', import.meta.url)),
      },
      formats: ['es'],
      fileName: (_format, entry) => `${entry}.js`,
    },
  },
});

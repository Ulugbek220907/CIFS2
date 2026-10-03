import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/admin') || id.includes('\\src\\admin')) {
            return 'admin';
          }
          if (id.includes('node_modules/katex') || id.includes('node_modules\\katex')) {
            return 'katex';
          }
        },
      },
    },
  },
});
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Builds one ES module script, dist/ask-paul.js, plus a lazily loaded chunk
// for the chat itself. Host it anywhere static and embed with a <script> tag.
export default defineConfig({
  plugins: [preact()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2020',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'ask-paul.js',
    },
    rollupOptions: {
      output: { chunkFileNames: 'ask-paul-[name]-[hash].js' },
    },
  },
});

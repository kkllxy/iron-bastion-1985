import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5194,
    strictPort: true,
    // 关闭 HMR：测试需要确定性的单游戏实例，避免热更新重载导致的钩子/状态竞争。
    hmr: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4194,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});

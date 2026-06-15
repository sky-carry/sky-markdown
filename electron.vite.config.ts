import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// ┌─────────────────────────────────────────────────────────────────────┐
// │ 修改开发服务器端口 / Host 就在这里。                                  │
// │ - 默认端口改成 5273（5173 被占用时可改成任意空闲端口）。              │
// │ - 也可用环境变量覆盖：  set SKY_DEV_PORT=6000 && npm run dev          │
// │ - host 设为 '0.0.0.0' 后会监听所有网卡，局域网内其他设备可用本机 IP   │
// │   访问该 Vite 服务（Electron 自身仍走 localhost 加载）。              │
// └─────────────────────────────────────────────────────────────────────┘
const DEV_PORT = Number(process.env.SKY_DEV_PORT) || 5273
const DEV_HOST = process.env.SKY_DEV_HOST || '0.0.0.0'

export default defineConfig({
  main: {
    // 把 node 依赖（electron-updater 等）外置，避免被打进 bundle 导致运行时报错
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    server: {
      host: DEV_HOST,
      port: DEV_PORT,
      // 端口被占用时直接报错而不是自动 +1，便于发现冲突；想自动顺延改成 false
      strictPort: true
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})

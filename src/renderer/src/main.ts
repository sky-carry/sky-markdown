import './styles/app.css'
import { createEditor } from './editor'
import { createSidebar } from './sidebar'
import { createStatusBar } from './statusbar'
import { createTabBar } from './tabs'
import { createTheme } from './theme'
import { Dispatcher } from './app/dispatcher'

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById('app') as HTMLElement
  const contentEl = document.getElementById('content') as HTMLElement
  const editorHost = document.getElementById('editor') as HTMLElement
  const sidebarEl = document.getElementById('sidebar') as HTMLElement
  const statusbarEl = document.getElementById('statusbar') as HTMLElement
  const tabbarEl = document.getElementById('tabbar') as HTMLElement

  const theme = createTheme(appEl)
  const editor = createEditor()
  const sidebar = createSidebar(sidebarEl)
  const statusbar = createStatusBar(statusbarEl)
  const tabs = createTabBar(tabbarEl)

  await editor.mount(editorHost)

  const dispatcher = new Dispatcher({ editor, sidebar, statusbar, tabs, theme, appEl, contentEl })
  dispatcher.init(WELCOME)

  // Receive native-menu commands from the main process.
  window.api.onMenuCommand((payload) => dispatcher.run(payload.id, payload.arg))
}

const WELCOME = `# 欢迎使用 Sky Markdown

这是一个 **Typora 风格** 的所见即所得 Markdown 编辑器。

- 直接输入即可实时渲染
- 支持 *斜体*、**加粗**、\`行内代码\`
- 通过顶部菜单使用全部功能

> 通过「视图 → 源代码模式」可以查看 Markdown 源码。

\`\`\`js
console.log('Hello, Sky Markdown')
\`\`\`
`

bootstrap().catch((err) => {
  console.error('Failed to start Sky Markdown:', err)
  document.body.innerHTML = `<pre style="padding:24px;color:#c00">${String(err?.stack || err)}</pre>`
})

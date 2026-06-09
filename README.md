# Sky Markdown

一个 **Typora 风格** 的所见即所得（WYSIWYG）Markdown 编辑器，面向 Windows 桌面。
基于 **Electron + TypeScript + Milkdown（ProseMirror）** 实现，开源免费。

> 参照 Typora 抽取核心功能：边输入边实时渲染、原生菜单栏、多主题、源码模式、
> 专注/打字机模式、侧边栏（大纲 / 文件树 / 搜索）、底部状态栏。

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 开发模式（热重载）
npm run build      # 构建到 out/
npm run build:win  # 打包为 Windows 安装包（NSIS，输出到 release/）
npm run typecheck  # 类型检查（主进程 + 渲染进程）
```

## 功能一览

界面与功能对照原型截图（`原型截图/`）实现，顶部为原生菜单栏：

| 菜单 | 已实现 |
| --- | --- |
| **文件** | 新建 / 打开 / 打开文件夹 / 最近文件 / 保存 / 另存为 / 导出(HTML·PDF·Word·图片) |
| **编辑** | 撤销 / 重做 / 剪切复制粘贴 / 移动行 / 查找替换入口 / 智能标点 |
| **段落** | 一~六级标题 / 段落 / 引用 / 代码块 / 表格 / 有序·无序·任务列表 / 分割线 |
| **格式** | 加粗 / 斜体 / 行内代码 / 删除线 / 超链接 / 图像 / 清除样式 |
| **视图** | 侧边栏 / 大纲 / 文件树 / 搜索 / 源代码模式 / 专注模式 / 打字机模式 / 状态栏 / 缩放 |
| **主题** | Github / Newsprint / Night / Pixyll / Whitey（实时切换，记忆上次选择） |
| **帮助** | 关于 / 官网 等 |

- **真·所见即所得**：基于 Milkdown，输入 Markdown 语法即时原地渲染，无分屏。
- **源代码模式**：`Ctrl+/` 在渲染视图与原始 Markdown 之间切换。
- **多主题**：5 套主题，存储于 `localStorage`，下次启动自动恢复。
- **侧边栏**：大纲（点击跳转标题）、文件树（懒加载展开）、全文搜索。
- **状态栏**：侧边栏开关、源码开关、拼写指示、实时字数统计。

## 架构

```
src/
├── shared/              # 主/渲染进程共享的契约（单一事实来源）
│   ├── commands.ts      #   全部菜单命令 id（Cmd.*）+ 主题 id
│   └── ipc.ts           #   IPC 通道名 + 载荷类型 + window.api 接口
├── main/                # Electron 主进程
│   ├── index.ts         #   窗口生命周期、菜单安装、窗口态 IPC
│   ├── menu.ts          #   原生菜单树（7 个菜单，发送 menuCommand）
│   └── fileManager.ts   #   文件对话框 / 读写 / 目录 / 导出 / 最近文件
├── preload/index.ts     # contextBridge 暴露 window.api（类型安全）
└── renderer/src/
    ├── main.ts          # 启动装配
    ├── types.ts         # 渲染层模块接口（EditorApi/SidebarApi/...）
    ├── app/dispatcher.ts# 命令路由 + 文档生命周期（脏标记/标题/打开保存）
    ├── editor/          # Milkdown 所见即所得编辑器
    ├── sidebar/         # 大纲 / 文件树 / 搜索
    ├── statusbar/       # 底部状态栏
    ├── theme/ + themes/ # 主题管理器 + 5 套主题 CSS
    └── styles/app.css   # 结构布局
```

**命令流**：原生菜单点击 → 主进程 `webContents.send('menu:command', {id})`
→ preload 转发 → `Dispatcher.run(id)` → 路由到编辑器 / 视图 / 主题 / 文件子系统。
菜单与编辑器都引用 `shared/commands.ts` 的同一份 id 列表，永不漂移。

## 说明

- Word / 图片导出当前以 HTML 内容写出对应扩展名（占位实现），PDF 导出使用
  Chromium 的 `printToPDF`，HTML 导出为完整独立文档。
- 部分菜单项（数学工具、脚注、链接引用、偏好设置等）已接入命令通道但尚为占位，
  后续可在 `dispatcher.ts` / `editor/index.ts` 中补全。

## 技术栈

Electron 33 · TypeScript 5 · electron-vite · Milkdown 7（ProseMirror）· electron-builder

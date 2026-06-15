import { Menu, BrowserWindow } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { basename } from 'path'
import { Channels } from '../shared/ipc'
import { Cmd } from '../shared/commands'
import type { CommandId } from '../shared/commands'
import type { MenuCommandPayload } from '../shared/ipc'
import { checkForUpdatesManually } from './updater'

/**
 * Build the native application menu (Chinese labels, Typora-style layout).
 * Every custom item emits a `menuCommand` IPC carrying a `Cmd.*` id; the
 * renderer dispatcher maps the id to an editor / UI action and safely ignores
 * ids it does not yet handle.
 */
export function createAppMenu(win: BrowserWindow, recentPaths: string[]): Menu {
  /** Build a click handler that sends the given command id (+ optional arg). */
  const send =
    (id: CommandId, arg?: string) =>
    (): void => {
      win.webContents.send(Channels.menuCommand, { id, arg } as MenuCommandPayload)
    }

  const recentSubmenu: MenuItemConstructorOptions[] =
    recentPaths.length === 0
      ? [{ label: '(无最近文件)', enabled: false }]
      : recentPaths.map((p) => ({
          label: basename(p),
          click: send(Cmd.fileOpenRecent, p)
        }))

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件(&F)',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: send(Cmd.fileNew) },
        { label: '新建窗口', click: send(Cmd.fileNewWindow) },
        { label: '打开...', accelerator: 'CmdOrCtrl+O', click: send(Cmd.fileOpen) },
        { label: '打开文件夹...', click: send(Cmd.fileOpenFolder) },
        { label: '快速打开...', accelerator: 'CmdOrCtrl+P', click: send(Cmd.fileQuickOpen) },
        { label: '打开最近文件', submenu: recentSubmenu },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: send(Cmd.fileSave) },
        { label: '另存为...', accelerator: 'CmdOrCtrl+Shift+S', click: send(Cmd.fileSaveAs) },
        { label: '移动到...', click: send(Cmd.fileMoveTo) },
        { label: '保存全部打开的文件...', click: send(Cmd.fileSaveAll) },
        { type: 'separator' },
        { label: '属性...', click: send(Cmd.fileProperties) },
        { label: '打开文件位置...', click: send(Cmd.fileOpenLocation) },
        { label: '在侧边栏中显示', click: send(Cmd.fileShowInSidebar) },
        { label: '删除...', click: send(Cmd.fileDelete) },
        { type: 'separator' },
        { label: '导入...', click: send(Cmd.fileImport) },
        {
          label: '导出',
          submenu: [
            { label: 'PDF', click: send(Cmd.fileExportPdf) },
            { label: 'HTML', click: send(Cmd.fileExportHtml) },
            { label: 'Word', click: send(Cmd.fileExportWord) },
            { label: '图片', click: send(Cmd.fileExportImage) }
          ]
        },
        { label: '打印...', accelerator: 'Alt+Shift+P', click: send(Cmd.filePrint) },
        { type: 'separator' },
        { label: '偏好设置...', accelerator: 'CmdOrCtrl+,', click: send(Cmd.filePreferences) },
        { label: '关闭', accelerator: 'CmdOrCtrl+W', click: send(Cmd.fileClose) }
      ]
    },
    {
      label: '编辑(&E)',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '拷贝图片', click: send(Cmd.editCopyImage) },
        { label: '粘贴', role: 'paste' },
        { type: 'separator' },
        { label: '复制为纯文本', click: send(Cmd.editCopyPlain) },
        {
          label: '复制为 Markdown',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: send(Cmd.editCopyMarkdown)
        },
        { label: '复制为 HTML 代码', click: send(Cmd.editCopyHtml) },
        {
          label: '粘贴为纯文本',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: send(Cmd.editPastePlain)
        },
        { type: 'separator' },
        {
          label: '选择',
          submenu: [
            { label: '全选', accelerator: 'CmdOrCtrl+A', click: send(Cmd.editSelectAll) },
            { label: '选中行', click: send(Cmd.editSelectLine) },
            { label: '选中词', click: send(Cmd.editSelectWord) }
          ]
        },
        { label: '上移该行', accelerator: 'Alt+Up', click: send(Cmd.editMoveLineUp) },
        { label: '下移该行', accelerator: 'Alt+Down', click: send(Cmd.editMoveLineDown) },
        { label: '删除该行', click: send(Cmd.editDeleteLine) },
        { type: 'separator' },
        { label: '智能标点', type: 'checkbox', click: send(Cmd.editSmartPunctuation) },
        { label: '查找和替换', accelerator: 'CmdOrCtrl+H', click: send(Cmd.editFindReplace) }
      ]
    },
    {
      label: '段落(&P)',
      submenu: [
        { label: '一级标题', accelerator: 'CmdOrCtrl+1', click: send(Cmd.paraHeading1) },
        { label: '二级标题', accelerator: 'CmdOrCtrl+2', click: send(Cmd.paraHeading2) },
        { label: '三级标题', accelerator: 'CmdOrCtrl+3', click: send(Cmd.paraHeading3) },
        { label: '四级标题', accelerator: 'CmdOrCtrl+4', click: send(Cmd.paraHeading4) },
        { label: '五级标题', accelerator: 'CmdOrCtrl+5', click: send(Cmd.paraHeading5) },
        { label: '六级标题', accelerator: 'CmdOrCtrl+6', click: send(Cmd.paraHeading6) },
        { label: '段落', accelerator: 'CmdOrCtrl+0', click: send(Cmd.paraParagraph) },
        { type: 'separator' },
        { label: '提升标题级别', accelerator: 'CmdOrCtrl+=', click: send(Cmd.paraHeadingUp) },
        { label: '降低标题级别', accelerator: 'CmdOrCtrl+-', click: send(Cmd.paraHeadingDown) },
        { type: 'separator' },
        { label: '表格', click: send(Cmd.paraTable) },
        { label: '公式块', accelerator: 'CmdOrCtrl+Shift+M', click: send(Cmd.paraMathBlock) },
        { label: '代码块', accelerator: 'CmdOrCtrl+Shift+K', click: send(Cmd.paraCodeBlock) },
        { label: '警告框', click: send(Cmd.paraAlert) },
        { label: '引用', accelerator: 'CmdOrCtrl+Shift+Q', click: send(Cmd.paraQuote) },
        { type: 'separator' },
        { label: '有序列表', accelerator: 'CmdOrCtrl+Shift+[', click: send(Cmd.paraOrderedList) },
        {
          label: '无序列表',
          accelerator: 'CmdOrCtrl+Shift+]',
          click: send(Cmd.paraUnorderedList)
        },
        { label: '任务列表', accelerator: 'CmdOrCtrl+Shift+X', click: send(Cmd.paraTaskList) },
        {
          label: '列表缩进',
          submenu: [
            { label: '增加缩进', click: send(Cmd.paraIndent) },
            { label: '减少缩进', click: send(Cmd.paraOutdent) }
          ]
        },
        { type: 'separator' },
        { label: '在上方插入段落', click: send(Cmd.paraInsertAbove) },
        { label: '在下方插入段落', click: send(Cmd.paraInsertBelow) },
        { type: 'separator' },
        { label: '链接引用', click: send(Cmd.paraLinkReference) },
        { label: '脚注', click: send(Cmd.paraFootnote) },
        { type: 'separator' },
        { label: '水平分割线', click: send(Cmd.paraHorizontalRule) },
        { label: '内容目录', click: send(Cmd.paraToc) },
        { label: 'YAML Front Matter', click: send(Cmd.paraYamlFrontMatter) }
      ]
    },
    {
      label: '格式(&O)',
      submenu: [
        { label: '加粗', accelerator: 'CmdOrCtrl+B', click: send(Cmd.fmtBold) },
        { label: '斜体', accelerator: 'CmdOrCtrl+I', click: send(Cmd.fmtItalic) },
        { label: '下划线', accelerator: 'CmdOrCtrl+U', click: send(Cmd.fmtUnderline) },
        { label: '代码', accelerator: 'CmdOrCtrl+Shift+`', click: send(Cmd.fmtCode) },
        { type: 'separator' },
        { label: '删除线', accelerator: 'Alt+Shift+5', click: send(Cmd.fmtStrikethrough) },
        { label: '注释', click: send(Cmd.fmtComment) },
        { type: 'separator' },
        { label: '超链接', accelerator: 'CmdOrCtrl+K', click: send(Cmd.fmtHyperlink) },
        { label: '图像', click: send(Cmd.fmtImage) },
        { label: '清除样式', accelerator: 'CmdOrCtrl+\\', click: send(Cmd.fmtClearStyle) }
      ]
    },
    {
      label: '视图(&V)',
      submenu: [
        {
          label: '显示/隐藏侧边栏',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: send(Cmd.viewToggleSidebar)
        },
        { label: '大纲', accelerator: 'CmdOrCtrl+Shift+1', click: send(Cmd.viewOutline) },
        { label: '文档列表', accelerator: 'CmdOrCtrl+Shift+2', click: send(Cmd.viewFileList) },
        { label: '文件树', accelerator: 'CmdOrCtrl+Shift+3', click: send(Cmd.viewFileTree) },
        { label: '搜索', accelerator: 'CmdOrCtrl+Shift+F', click: send(Cmd.viewSearch) },
        { type: 'separator' },
        {
          label: '源代码模式',
          type: 'checkbox',
          accelerator: 'CmdOrCtrl+/',
          click: send(Cmd.viewSourceMode)
        },
        { type: 'separator' },
        { label: '专注模式', type: 'checkbox', accelerator: 'F8', click: send(Cmd.viewFocusMode) },
        {
          label: '打字机模式',
          type: 'checkbox',
          accelerator: 'F9',
          click: send(Cmd.viewTypewriterMode)
        },
        { type: 'separator' },
        {
          label: '显示状态栏',
          type: 'checkbox',
          checked: true,
          click: send(Cmd.viewStatusBar)
        },
        { label: '字数统计窗口', click: send(Cmd.viewWordCount) },
        { type: 'separator' },
        { label: '切换全屏', accelerator: 'F11', role: 'togglefullscreen' },
        { label: '保持窗口在最前端', type: 'checkbox', click: send(Cmd.viewAlwaysOnTop) },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+Shift+9', click: send(Cmd.viewActualSize) },
        { label: '放大', accelerator: 'CmdOrCtrl+Shift+=', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+Shift+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'Shift+F12', role: 'toggleDevTools' }
      ]
    },
    {
      label: '主题(&T)',
      submenu: [
        { label: 'Github', type: 'radio', checked: true, click: send(Cmd.themeGithub) },
        { label: 'Newsprint', type: 'radio', click: send(Cmd.themeNewsprint) },
        { label: 'Night', type: 'radio', click: send(Cmd.themeNight) },
        { label: 'Pixyll', type: 'radio', click: send(Cmd.themePixyll) },
        { label: 'Whitey', type: 'radio', click: send(Cmd.themeWhitey) }
      ]
    },
    {
      label: '帮助(&H)',
      submenu: [
        { label: "What's New...", click: send(Cmd.helpQuickStart) },
        { label: 'Quick Start', click: send(Cmd.helpQuickStart) },
        { label: 'Markdown Reference', click: send(Cmd.helpMarkdownReference) },
        { type: 'separator' },
        { label: '反馈', click: send(Cmd.helpFeedback) },
        { label: '官方网站', click: send(Cmd.helpWebsite) },
        { type: 'separator' },
        { label: '检查更新...', click: () => checkForUpdatesManually() },
        { label: '关于', click: send(Cmd.helpAbout) }
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}

/**
 * Central command-id registry — the contract between the native menu (main process)
 * and the renderer's command dispatcher. The menu emits these ids over IPC; the
 * renderer maps each id to an editor / UI action.
 *
 * NEVER hard-code a command string elsewhere — reference `Cmd.*` so the menu and
 * dispatcher can never drift apart.
 */
export const Cmd = {
  // ---- File ----
  fileNew: 'file.new',
  fileNewWindow: 'file.newWindow',
  fileOpen: 'file.open',
  fileOpenFolder: 'file.openFolder',
  fileQuickOpen: 'file.quickOpen',
  fileSave: 'file.save',
  fileSaveAs: 'file.saveAs',
  fileSaveAll: 'file.saveAll',
  fileMoveTo: 'file.moveTo',
  fileProperties: 'file.properties',
  fileOpenLocation: 'file.openLocation',
  fileShowInSidebar: 'file.showInSidebar',
  fileDelete: 'file.delete',
  fileImport: 'file.import',
  fileExportPdf: 'file.export.pdf',
  fileExportHtml: 'file.export.html',
  fileExportWord: 'file.export.word',
  fileExportImage: 'file.export.image',
  filePrint: 'file.print',
  filePreferences: 'file.preferences',
  fileClose: 'file.close',
  fileOpenRecent: 'file.openRecent', // payload: filePath

  // ---- Edit ----
  editUndo: 'edit.undo',
  editRedo: 'edit.redo',
  editCut: 'edit.cut',
  editCopy: 'edit.copy',
  editCopyImage: 'edit.copyImage',
  editPaste: 'edit.paste',
  editCopyPlain: 'edit.copyPlain',
  editCopyMarkdown: 'edit.copyMarkdown',
  editCopyHtml: 'edit.copyHtml',
  editCopySimplified: 'edit.copySimplified',
  editPastePlain: 'edit.pastePlain',
  editSelectAll: 'edit.selectAll',
  editSelectLine: 'edit.selectLine',
  editSelectWord: 'edit.selectWord',
  editMoveLineUp: 'edit.moveLineUp',
  editMoveLineDown: 'edit.moveLineDown',
  editDeleteLine: 'edit.deleteLine',
  editFindReplace: 'edit.findReplace',
  editSmartPunctuation: 'edit.smartPunctuation',

  // ---- Paragraph ----
  paraHeading1: 'para.heading1',
  paraHeading2: 'para.heading2',
  paraHeading3: 'para.heading3',
  paraHeading4: 'para.heading4',
  paraHeading5: 'para.heading5',
  paraHeading6: 'para.heading6',
  paraParagraph: 'para.paragraph',
  paraHeadingUp: 'para.headingUp',
  paraHeadingDown: 'para.headingDown',
  paraTable: 'para.table',
  paraMathBlock: 'para.mathBlock',
  paraCodeBlock: 'para.codeBlock',
  paraAlert: 'para.alert',
  paraQuote: 'para.quote',
  paraOrderedList: 'para.orderedList',
  paraUnorderedList: 'para.unorderedList',
  paraTaskList: 'para.taskList',
  paraIndent: 'para.indent',
  paraOutdent: 'para.outdent',
  paraInsertAbove: 'para.insertAbove',
  paraInsertBelow: 'para.insertBelow',
  paraLinkReference: 'para.linkReference',
  paraFootnote: 'para.footnote',
  paraHorizontalRule: 'para.horizontalRule',
  paraToc: 'para.toc',
  paraYamlFrontMatter: 'para.yamlFrontMatter',

  // ---- Format ----
  fmtBold: 'fmt.bold',
  fmtItalic: 'fmt.italic',
  fmtUnderline: 'fmt.underline',
  fmtCode: 'fmt.code',
  fmtStrikethrough: 'fmt.strikethrough',
  fmtComment: 'fmt.comment',
  fmtHyperlink: 'fmt.hyperlink',
  fmtImage: 'fmt.image',
  fmtClearStyle: 'fmt.clearStyle',

  // ---- View ----
  viewToggleSidebar: 'view.toggleSidebar',
  viewOutline: 'view.outline',
  viewFileList: 'view.fileList',
  viewFileTree: 'view.fileTree',
  viewSearch: 'view.search',
  viewSourceMode: 'view.sourceMode',
  viewFocusMode: 'view.focusMode',
  viewTypewriterMode: 'view.typewriterMode',
  viewStatusBar: 'view.statusBar',
  viewWordCount: 'view.wordCount',
  viewFullscreen: 'view.fullscreen',
  viewAlwaysOnTop: 'view.alwaysOnTop',
  viewActualSize: 'view.actualSize',
  viewZoomIn: 'view.zoomIn',
  viewZoomOut: 'view.zoomOut',
  viewDevTools: 'view.devTools',

  // ---- Theme ---- (payload-less; id encodes the theme)
  themeGithub: 'theme.github',
  themeNewsprint: 'theme.newsprint',
  themeNight: 'theme.night',
  themePixyll: 'theme.pixyll',
  themeWhitey: 'theme.whitey',

  // ---- Help ----
  helpQuickStart: 'help.quickStart',
  helpMarkdownReference: 'help.markdownReference',
  helpFeedback: 'help.feedback',
  helpWebsite: 'help.website',
  helpAbout: 'help.about'
} as const

export type CommandId = (typeof Cmd)[keyof typeof Cmd]

export const ThemeIds = ['github', 'newsprint', 'night', 'pixyll', 'whitey'] as const
export type ThemeId = (typeof ThemeIds)[number]

// Rasterize build/icon.svg to a single 256px image (headless Chromium), then
// downscale with nativeImage.resize and pack a multi-size build/icon.ico for the
// Windows installer + runtime. Run with:
//   ./node_modules/.bin/electron build/gen-icon.cjs
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('in-process-gpu')

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const buildDir = __dirname
const svg = fs.readFileSync(path.join(buildDir, 'icon.svg'), 'utf8')
const outDir = path.join(buildDir, 'icons')
fs.mkdirSync(outDir, { recursive: true })

function packIco(entries) {
  const count = entries.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  const datas = []
  entries.forEach((e, i) => {
    const b = i * 16
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 0)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 1)
    dir.writeUInt8(0, b + 2)
    dir.writeUInt8(0, b + 3)
    dir.writeUInt16LE(1, b + 4)
    dir.writeUInt16LE(32, b + 6)
    dir.writeUInt32LE(e.png.length, b + 8)
    dir.writeUInt32LE(offset, b + 12)
    offset += e.png.length
    datas.push(e.png)
  })
  return Buffer.concat([header, dir, ...datas])
}

app.whenReady().then(async () => {
  try {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:transparent;overflow:hidden}
      ::-webkit-scrollbar{width:0;height:0;display:none}
      #w{width:256px;height:256px;overflow:hidden}
      svg{display:block}
    </style></head><body><div id="w">${svg}</div></body></html>`
    const file = path.join(outDir, '_render.html')
    fs.writeFileSync(file, html)

    const win = new BrowserWindow({
      width: 256,
      height: 256,
      show: false,
      transparent: true,
      frame: false,
      backgroundColor: '#00000000',
      useContentSize: true
    })
    await win.loadFile(file)
    await new Promise((r) => setTimeout(r, 300))
    const base = await win.webContents.capturePage()
    const size = base.getSize()
    console.log('captured', size.width, 'x', size.height)

    // Sanity: check a corner pixel's alpha to confirm transparency was captured.
    const bm = base.getBitmap() // BGRA
    console.log('corner alpha (0,0):', bm[3], ' center alpha:', bm[(128 * size.width + 128) * 4 + 3])

    const entries = []
    for (const s of SIZES) {
      const img = base.resize({ width: s, height: s, quality: 'best' })
      const png = img.toPNG()
      fs.writeFileSync(path.join(outDir, `icon-${s}.png`), png)
      entries.push({ size: s, png })
      console.log('size', s, png.length, 'bytes')
    }
    win.destroy()

    const ico = packIco(entries)
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)
    fs.copyFileSync(path.join(outDir, 'icon-256.png'), path.join(buildDir, 'icon.png'))
    console.log('WROTE icon.ico', ico.length, 'bytes + icon.png')
  } catch (e) {
    console.log('ERROR', String((e && e.stack) || e))
  } finally {
    app.quit()
  }
})

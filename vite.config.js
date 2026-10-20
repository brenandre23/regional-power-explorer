import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import zlib from 'node:zlib'

const gzip = promisify(zlib.gzip)

// Public URL: https://designstudio.worldbank.org/regional-power-explorer/
// Vercel (which sets VERCEL=1 at build time) still deploys main at its domain
// root, regional-power-explorer.vercel.app, so it keeps building for '/'.
const BASE = process.env.VERCEL ? '/' : '/regional-power-explorer/'

// The Design Studio server (Apache) compresses nothing and ignores .htaccess:
// region_lines_eu.geojson went over the wire as 20.8 MB, 1.8 MB gzipped. So
// the build gzips the data files itself, and dist/sw.js, a service worker,
// asks for `<file>.gz` and unzips it in the browser. A service worker sees
// MapLibre's worker fetches and the notes iframes too, which a page-level
// helper can't. The raw files stay: they serve the first visit, before the
// worker takes over, and browsers without service workers. Design Studio build
// only; Vercel compresses on its own. The worker's source is src/sw.js.
const GZIP_TYPES = /\.(json|geojson|html)$/
const GZIP_MIN_BYTES = 4096
const GZIP_MIN_SAVING = 0.1

function gzipData() {
  let outDir
  return {
    name: 'gzip-data',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      if (BASE === '/') return
      const dataDir = path.join(outDir, 'data')
      const list = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
        e.isDirectory() ? list(path.join(d, e.name)) : [path.join(d, e.name)])
      const queue = list(dataDir).filter(f => GZIP_TYPES.test(f) && fs.statSync(f).size >= GZIP_MIN_BYTES)

      const gzipped = []
      let rawBytes = 0, gzBytes = 0
      const work = async () => {
        for (let file; (file = queue.shift());) {
          const raw = await fs.promises.readFile(file)
          const gz = await gzip(raw, { level: 9 })
          if (gz.length > raw.length * (1 - GZIP_MIN_SAVING)) continue
          await fs.promises.writeFile(file + '.gz', gz)
          gzipped.push(path.relative(dataDir, file).split(path.sep).join('/'))
          rawBytes += raw.length
          gzBytes += gz.length
        }
      }
      await Promise.all(Array.from({ length: os.availableParallelism() }, work))
      gzipped.sort()

      const sw = fs.readFileSync(path.resolve('src/sw.js'), 'utf8')
        .replace("'__DATA_PREFIX__'", JSON.stringify(BASE + 'data/'))
        .replace('[/* __GZIPPED__ */]', JSON.stringify(gzipped))
      fs.writeFileSync(path.join(outDir, 'sw.js'), sw)
      const mb = n => (n / 1e6).toFixed(1) + ' MB'
      console.log(`gzip-data: ${gzipped.length} data files, ${mb(rawBytes)} -> ${mb(gzBytes)}`)
    },
  }
}

// Every file under public/data, as `virtual:data-manifest`: lets the app skip
// requests for optional files a region or country doesn't have. See
// src/utils/dataGuard.js.
function dataManifest() {
  const ID = 'virtual:data-manifest'
  const dir = path.resolve('public/data')
  const list = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? list(path.join(d, e.name)) : [path.relative(dir, path.join(d, e.name)).split(path.sep).join('/')])
  return {
    name: 'data-manifest',
    resolveId: id => (id === ID ? '\0' + ID : null),
    load: id => (id === '\0' + ID ? `export default ${JSON.stringify(list(dir))}` : null),
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [react(), dataManifest(), gzipData()],
})

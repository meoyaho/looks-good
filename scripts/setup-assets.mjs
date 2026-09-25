// Prepares the files MediaPipe needs at runtime so the site works fully
// offline once built: the WASM runtime (copied from node_modules) and the
// face landmarker model (downloaded once, then cached in public/).
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WASM_SRC = path.join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const WASM_DEST = path.join(ROOT, 'public', 'mediapipe')
const MODEL_DEST = path.join(ROOT, 'public', 'models', 'face_landmarker.task')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

mkdirSync(WASM_DEST, { recursive: true })
for (const file of readdirSync(WASM_SRC)) {
  copyFileSync(path.join(WASM_SRC, file), path.join(WASM_DEST, file))
}
console.log(`mediapipe wasm copied -> public/mediapipe`)

if (existsSync(MODEL_DEST)) {
  console.log('face landmarker model already present')
} else {
  mkdirSync(path.dirname(MODEL_DEST), { recursive: true })
  console.log('downloading face landmarker model...')
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`model download failed: ${res.status}`)
  writeFileSync(MODEL_DEST, Buffer.from(await res.arrayBuffer()))
  console.log('model saved -> public/models/face_landmarker.task')
}

// Builds the web images in public/images/ from the Figma exports in assets/figma/.
// The outputs are committed, so this only needs re-running after an asset changes:
//   npm run images
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'assets', 'figma')
const OUT = path.join(ROOT, 'public', 'images')

/** Figma layer export → output path, longest side in px (originals are up to 3446px), webp quality. */
const IMAGES = [
  ['image 1.png', 'background.webp', 1672, 85],
  ['시바-옆모습2_0002_제거-도구-편집.png', 'dog/side.webp', 664, 85],
  ['강아지 옆으로보기 1.png', 'dog/side-look.webp', 800, 90],
  ['좀 더 관심 갖기.png', 'dog/stand-front.webp', 1000, 85],
  ['왼발 앞으로.png', 'dog/front-left.webp', 800, 85],
  ['오른발앞.png', 'dog/front-right.webp', 800, 85],
  ['강아지 가까이서 보기.png', 'dog/closeup-look.webp', 1100, 85],
  ['가까이서 보기2.png', 'dog/closeup-sniff.webp', 1100, 85],
  ['시바_0003_시바-뒤45.png', 'dog/back-45.webp', 800, 85],
  ['뒷모습1.png', 'dog/back-1.webp', 804, 85],
  ['뒷모습2.png', 'dog/back-2.webp', 804, 85],
  ['쉬.png', 'effects/puddle.webp', 600, 85],
]

/** Vector layers are copied as-is. */
const COPIES = [
  ['Ellipse 1.svg', 'effects/blush-left.svg'],
  ['Ellipse 2.svg', 'effects/blush-right.svg'],
]

rmSync(OUT, { recursive: true, force: true })

for (const [src, out, maxSide, quality] of IMAGES) {
  const dest = path.join(OUT, out)
  mkdirSync(path.dirname(dest), { recursive: true })
  const info = await sharp(path.join(SRC, src))
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality, alphaQuality: 90 })
    .toFile(dest)
  console.log(`${out.padEnd(24)} ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)}KB`)
}

for (const [src, out] of COPIES) {
  const dest = path.join(OUT, out)
  mkdirSync(path.dirname(dest), { recursive: true })
  copyFileSync(path.join(SRC, src), dest)
  console.log(out)
}

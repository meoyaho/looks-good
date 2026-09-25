// Which sprite each Figma motion node drives, per tier.
// The motion JSON only carries node ids + keyframes (no image names or
// resting positions). Node ↔ Figma layer was matched from the frames' layer
// panels by timing — the three frames share one structure, so e.g. the node
// that appears at 2000-2740ms is 강아지 옆으로보기 in every tier. Placement is
// ours, since the export has no positions for untranslated layers.
import type { Tier } from '../analysis'
import { toTrack, type MotionFile, type Track } from './timeline'
import passByData from '../../assets/motion/pass-by.json'
import approachRetreatData from '../../assets/motion/approach-retreat.json'
import approachPeeData from '../../assets/motion/approach-pee.json'

/** Figma frame size the translation keyframes are authored in. */
export const STAGE_W = 1920
export const STAGE_H = 1350

/**
 * Image under public/images/ (Figma layer name in comments; built from assets/figma by
 * `npm run images`) → width / height, so layers can be centred before the image loads.
 */
const SPRITES = {
  side: { file: 'dog/side.webp', aspect: 664 / 597 }, // 시바-옆모습2_0002_제거-도구-편집 (Group 1)
  sideLook: { file: 'dog/side-look.webp', aspect: 386 / 361 }, // 강아지 옆으로보기
  moreInterest: { file: 'dog/stand-front.webp', aspect: 751 / 1000 }, // 좀 더 관심 갖기
  frontLeft: { file: 'dog/front-left.webp', aspect: 338 / 800 }, // 왼발 앞으로
  frontRight: { file: 'dog/front-right.webp', aspect: 344 / 800 }, // 오른발앞
  closeupLook: { file: 'dog/closeup-look.webp', aspect: 850 / 1100 }, // 강아지 가까이서 보기
  closeupSniff: { file: 'dog/closeup-sniff.webp', aspect: 669 / 1100 }, // 가까이서 보기2
  back45: { file: 'dog/back-45.webp', aspect: 439 / 631 }, // 시바_0003_시바-뒤45
  back1: { file: 'dog/back-1.webp', aspect: 332 / 798 }, // 뒷모습1
  back2: { file: 'dog/back-2.webp', aspect: 352 / 804 }, // 뒷모습2
  puddle: { file: 'effects/puddle.webp', aspect: 1 }, // 쉬
  blushL: { file: 'effects/blush-left.svg', aspect: 148 / 105 }, // Ellipse 1
  blushR: { file: 'effects/blush-right.svg', aspect: 148 / 105 }, // Ellipse 2
} as const
type SpriteName = keyof typeof SPRITES

/** Resting box of a layer in stage pixels. For tracked layers, x/y keyframes override left/top. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
  /** Extra rotation in degrees around the box centre (e.g. to follow a tilted face). */
  rotate?: number
}

export interface Layer {
  nodeId: string
  src: string
  alt: string
  box: Box
  track: Track
}

export interface Scene {
  durationMs: number
  layers: Layer[]
}

type Placement = (sprite: SpriteName) => Box

/** Box of `height` whose bottom edge is centred on (cx, bottom). */
const standingAt =
  (cx: number, bottom: number, height: number): Placement =>
  (sprite) => {
    const width = height * SPRITES[sprite].aspect
    return { left: cx - width / 2, top: bottom - height, width, height }
  }

// The walking body's translation keyframes are its top-left corner; it stops at (757, 840).
const BODY_H = 270
const BODY_REST = { x: 757, y: 840 }
const FEET = { cx: BODY_REST.x + (BODY_H * SPRITES.side.aspect) / 2, bottom: BODY_REST.y + BODY_H }

/** Walking body: sized like the others, positioned by its keyframes (top-left). */
const tracked: Placement = (sprite) => ({ left: 0, top: 0, width: BODY_H * SPRITES[sprite].aspect, height: BODY_H })
/** Standing where the walking body stopped, feet on the same spot. */
const atRest = (heightScale = 1) => standingAt(FEET.cx, FEET.bottom, BODY_H * heightScale)
/**
 * The dog right in front of the camera: a big photo standing near the bottom.
 * Sized so that even at the motion's peak scale (1.22) it stays inside the
 * band a 16:9 screen shows of the 1920x1350 stage (roughly y 135-1215).
 */
const CLOSEUP_H = 900
const CLOSEUP_BOTTOM = 1230
const closeup = (heightScale = 1) => standingAt(STAGE_W / 2, CLOSEUP_BOTTOM, CLOSEUP_H * heightScale)
/** Mid-distance: walking toward the camera, or walking away from it after turning round. */
const approaching = standingAt(STAGE_W / 2, 1180, 560)

/** A point on the full-size closeup-look photo, given as fractions of its width/height. */
/**
 * A box centred on a point of the closeup-look photo (fractions of its width/height),
 * for when the photo is shown at `photoScale` (its layer scales around its bottom centre).
 */
function onCloseupLook(fx: number, fy: number, height: number, opts: { photoScale?: number; rotate?: number } = {}): Placement {
  const { photoScale = 1, rotate } = opts
  const photo = closeup()('closeupLook')
  const originX = photo.left + photo.width / 2
  const originY = photo.top + photo.height
  const cx = originX + (photo.left + photo.width * fx - originX) * photoScale
  const cy = originY + (photo.top + photo.height * fy - originY) * photoScale
  return (sprite) => ({ ...standingAt(cx, cy + height / 2, height)(sprite), rotate })
}

type LayerSpec = [nodeId: string, sprite: SpriteName, place: Placement, alt: string]

/** `layers` go back to front, matching the Figma layer panel read bottom-up. */
function build(data: MotionFile, layers: LayerSpec[]): Scene {
  const nodes = new Map(data.nodes.map((n) => [n.node, n]))
  return {
    durationMs: data.nodes[0].timelineDurationMs,
    layers: layers.map(([nodeId, sprite, place, alt]) => {
      const node = nodes.get(nodeId)
      if (!node) throw new Error(`motion node ${nodeId} missing`)
      return { nodeId, src: `${import.meta.env.BASE_URL}images/${SPRITES[sprite].file}`, alt, box: place(sprite), track: toTrack(node) }
    }),
  }
}

/*
 * Shared timeline of all three frames:
 *   0-2000      Group 1 walks in (side view)
 *   2000-2740   강아지 옆으로보기 — stops
 *   2740-3740   좀 더 관심 갖기 — turns to look at you
 * then per tier (see below).
 *
 * The leg layers inside Group 1 are intentionally left out, so their
 * rotation nodes (2530:865 / 2530:864 in pass-by) are unused; the body's own
 * translateY bob carries the walk.
 */

/** Low — stops, looks at you (2740-4000), looks ahead again, walks on. */
const passBy = build(passByData as MotionFile, [
  ['2530:866', 'side', tracked, '걸어가는 시바견'],
  ['2530:869', 'sideLook', atRest(), '멈춰서 쳐다보는 시바견'],
  ['2530:872', 'moreInterest', atRest(1.15), '고개를 돌려 쳐다보는 시바견'],
])

/**
 * Mid — looks, walks up to you (alternating paws, growing), peeks at you
 * close up a few times, turns round and trots off (back views, shrinking),
 * then walks out of frame in side view.
 */
const approachRetreat = build(approachRetreatData as MotionFile, [
  ['2534:632', 'side', tracked, '걸어가는 시바견'],
  ['2534:638', 'sideLook', atRest(), '멈춰서 쳐다보는 시바견'],
  ['2534:260', 'moreInterest', atRest(1.15), '고개를 돌려 쳐다보는 시바견'],
  ['2534:261', 'frontLeft', approaching, '다가오는 시바견'],
  ['2534:262', 'frontRight', approaching, '다가오는 시바견'],
  ['2534:264', 'closeupSniff', closeup(), '가까이서 기웃거리는 시바견'],
  ['2534:263', 'closeupLook', closeup(), '가까이서 올려다보는 시바견'],
  ['2530:871', 'back45', approaching, '돌아서는 시바견'],
  ['2530:875', 'back2', approaching, '멀어지는 시바견'],
  ['2530:876', 'back1', approaching, '멀어지는 시바견'],
])

/** High — looks, walks up to you, peeks close up, then stays gazing up, blushing, and pees. */
const approachPee = build(approachPeeData as MotionFile, [
  ['2534:748', 'side', tracked, '걸어가는 시바견'],
  ['2534:532', 'sideLook', atRest(), '멈춰서 쳐다보는 시바견'],
  ['2530:1046', 'moreInterest', atRest(1.15), '고개를 돌려 쳐다보는 시바견'],
  ['2530:873', 'frontLeft', approaching, '다가오는 시바견'],
  ['2530:874', 'frontRight', approaching, '다가오는 시바견'],
  // Behind the close-up (as in Figma), so it sits beside the paws rather than under them.
  ['2534:555', 'puddle', onCloseupLook(0.92, 0.84, 340), '쉬 웅덩이'],
  ['2530:868', 'closeupSniff', closeup(), '가까이서 기웃거리는 시바견'],
  // Stays on screen to the end: the dog gazing up at you.
  ['2530:867', 'closeupLook', closeup(), '반한 표정의 시바견'],
  // Blush on the cheeks of 2530:867, which is held at scale 1.03 by the time it fades in (7340ms).
  // The head is tilted ~80° (eyes at 46%,23% and 50%,46%; nose at 20%,35%), so each cheek sits
  // muzzle-side of its eye and the ellipses are turned to follow the eye line.
  ['2534:116', 'blushL', onCloseupLook(0.31, 0.26, 160, { photoScale: 1.03, rotate: 78 }), ''],
  ['2534:146', 'blushR', onCloseupLook(0.36, 0.5, 160, { photoScale: 1.03, rotate: 78 }), ''],
])

export const SCENES: Record<Tier, Scene> = {
  low: passBy,
  mid: approachRetreat,
  high: approachPee,
}

// Samples Figma motion-export keyframes at an arbitrary time.
// Each keyframe says how to get to the NEXT one: hold (step), a cubic-bezier
// curve, or (when absent) linear.

export interface Keyframe {
  timeMs: number
  value: number
  easingToNext?: {
    hold?: boolean
    bezierValues?: { p1x: number; p1y: number; p2x: number; p2y: number }
  }
}

export interface MotionField {
  field: string
  keyframes: Keyframe[]
}

export interface MotionNode {
  node: string
  timelineDurationMs: number
  fields: MotionField[]
}

export interface MotionFile {
  version: number
  playbackStyle: string
  nodes: MotionNode[]
}

/** The properties a layer can animate. Figma names them e.g. "motionTranslationX@-1:-1". */
export type Channel = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity'

const FIELD_TO_CHANNEL: Record<string, Channel> = {
  motionTranslationX: 'x',
  motionTranslationY: 'y',
  motionScaleX: 'scaleX',
  motionScaleY: 'scaleY',
  motionRotation: 'rotation',
  opacity: 'opacity',
}

export type Track = Partial<Record<Channel, Keyframe[]>>

/** Index a node's fields by channel name, ignoring the "@-1:-1" suffix. */
export function toTrack(node: MotionNode): Track {
  const track: Track = {}
  for (const f of node.fields) {
    const channel = FIELD_TO_CHANNEL[f.field.split('@')[0]]
    if (channel) track[channel] = f.keyframes
  }
  return track
}

/**
 * y for a CSS-style cubic-bezier(p1x, p1y, p2x, p2y) at progress x.
 * x(t) is monotonic on [0,1] for valid easing curves, so bisection is enough.
 */
export function cubicBezierAt(p1x: number, p1y: number, p2x: number, p2y: number, x: number): number {
  const bez = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  let lo = 0
  let hi = 1
  let t = x
  for (let i = 0; i < 40; i++) {
    const cx = bez(t, p1x, p2x)
    if (Math.abs(cx - x) < 1e-6) break
    if (cx < x) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return bez(t, p1y, p2y)
}

export function sample(keyframes: Keyframe[], timeMs: number): number {
  const first = keyframes[0]
  const last = keyframes[keyframes.length - 1]
  if (timeMs <= first.timeMs) return first.value
  if (timeMs >= last.timeMs) return last.value

  let i = 0
  while (keyframes[i + 1].timeMs < timeMs) i++
  const a = keyframes[i]
  const b = keyframes[i + 1]
  const easing = a.easingToNext
  if (easing?.hold) return timeMs < b.timeMs ? a.value : b.value

  const span = b.timeMs - a.timeMs
  const progress = span > 0 ? (timeMs - a.timeMs) / span : 1
  const bz = easing?.bezierValues
  const eased = bz ? cubicBezierAt(bz.p1x, bz.p1y, bz.p2x, bz.p2y, progress) : progress
  return a.value + (b.value - a.value) * eased
}

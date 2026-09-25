// Pure face-balance math on MediaPipe Face Landmarker's 478-point mesh.
// Nothing here touches the DOM, so it can be unit-tested with synthetic points.

export interface Point {
  x: number
  y: number
}

/** MediaPipe face mesh landmark indices used for measurement. */
export const LM = {
  foreheadTop: 10, // top of the mesh — used as the hairline proxy
  glabella: 9, // between the eyebrows (brow line)
  subnasale: 2, // just under the nose
  chin: 152, // menton
  eyeOuterL: 33,
  eyeOuterR: 263,
  cheekL: 234,
  cheekR: 454,
} as const

/** Mirrored left/right landmark pairs compared for symmetry. */
export const SYMMETRY_PAIRS: [number, number][] = [
  [33, 263], // outer eye corners
  [133, 362], // inner eye corners
  [159, 386], // upper eyelids
  [145, 374], // lower eyelids
  [70, 300], // outer brows
  [105, 334], // mid brows
  [55, 285], // inner brows
  [129, 358], // nose wings
  [61, 291], // mouth corners
  [172, 397], // jaw angles
  [149, 378], // lower jaw
]

/** Landmarks on the facial midline, averaged to get the symmetry axis. */
export const MIDLINE = [10, 151, 9, 168, 6, 197, 195, 5, 4, 1, 2, 164, 0, 17, 152]

/**
 * MediaPipe's top landmark (10) sits mid-forehead, well below the real
 * hairline, so the raw upper third reads short (an average face measured
 * ~0.54 of the middle third). Multiplying by this brings it to the hairline.
 * Calibrated from a single averaged face — retune with more samples by
 * comparing the guide's top line against the real hairline.
 */
export const HAIRLINE_CORRECTION = 1.4

export const TARGETS = [
  { name: '1 : 1 : 1', label: '황금 비율', upper: 1, lower: 1 },
  { name: '1 : 1 : 0.8', label: '동안 비율', upper: 1, lower: 0.8 },
] as const

/** Rotate every point so the line between the outer eye corners is horizontal (removes head roll). */
export function levelByEyes(points: Point[]): Point[] {
  const l = points[LM.eyeOuterL]
  const r = points[LM.eyeOuterR]
  const angle = Math.atan2(r.y - l.y, r.x - l.x)
  const cx = (l.x + r.x) / 2
  const cy = (l.y + r.y) / 2
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  return points.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  })
}

export interface Thirds {
  upper: number
  middle: number
  lower: number
}

export function measureThirds(levelled: Point[], hairlineCorrection = HAIRLINE_CORRECTION): Thirds {
  const top = levelled[LM.foreheadTop].y
  const brow = levelled[LM.glabella].y
  const nose = levelled[LM.subnasale].y
  const chin = levelled[LM.chin].y
  return {
    upper: (brow - top) * hairlineCorrection,
    middle: nose - brow,
    lower: chin - nose,
  }
}

/** Mean left/right mismatch as a fraction of face width (0 = perfectly symmetric). */
export function measureAsymmetry(levelled: Point[]): number {
  const faceWidth = Math.abs(levelled[LM.cheekR].x - levelled[LM.cheekL].x) || 1
  const axisX = MIDLINE.reduce((sum, i) => sum + levelled[i].x, 0) / MIDLINE.length
  let total = 0
  for (const [li, ri] of SYMMETRY_PAIRS) {
    const l = levelled[li]
    const r = levelled[ri]
    // A mirrored pair should straddle the axis equally and sit at equal height.
    const horizontal = Math.abs(Math.abs(l.x - axisX) - Math.abs(r.x - axisX))
    const vertical = Math.abs(l.y - r.y)
    total += Math.hypot(horizontal, vertical)
  }
  return total / SYMMETRY_PAIRS.length / faceWidth
}

export interface FaceMetrics {
  thirds: Thirds
  asymmetry: number
}

/** `points` must be in pixel space (normalized x * width, y * height) so aspect ratio is preserved. */
export function measureFace(points: Point[]): FaceMetrics {
  const levelled = levelByEyes(points)
  return { thirds: measureThirds(levelled), asymmetry: measureAsymmetry(levelled) }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Median across frames, so a single jittery frame can't swing the result. */
export function aggregateMetrics(samples: FaceMetrics[]): FaceMetrics {
  return {
    thirds: {
      upper: median(samples.map((s) => s.thirds.upper)),
      middle: median(samples.map((s) => s.thirds.middle)),
      lower: median(samples.map((s) => s.thirds.lower)),
    },
    asymmetry: median(samples.map((s) => s.asymmetry)),
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Distance from the ideal (upper/middle, lower/middle) at which the proportion score hits 0. */
export const PROPORTION_TOLERANCE = 0.6
/** Asymmetry (fraction of face width) at which the symmetry score hits 0. */
export const ASYMMETRY_TOLERANCE = 0.1

export interface Evaluation {
  /** Thirds expressed relative to the middle third (middle = 1). */
  ratio: { upper: number; middle: 1; lower: number }
  closestTarget: (typeof TARGETS)[number]
  proportionScore: number
  symmetryScore: number
  totalScore: number
  tier: Tier
}

export type Tier = 'high' | 'mid' | 'low'

export const TIER_THRESHOLDS = { high: 65, mid: 40 }

export function tierFromScore(score: number): Tier {
  if (score >= TIER_THRESHOLDS.high) return 'high'
  if (score >= TIER_THRESHOLDS.mid) return 'mid'
  return 'low'
}

export function evaluate(metrics: FaceMetrics): Evaluation {
  const { upper, middle, lower } = metrics.thirds
  const u = upper / middle
  const l = lower / middle

  let closest: (typeof TARGETS)[number] = TARGETS[0]
  let bestDistance = Infinity
  for (const target of TARGETS) {
    const d = Math.hypot(u - target.upper, l - target.lower)
    if (d < bestDistance) {
      bestDistance = d
      closest = target
    }
  }

  const proportionScore = Math.round(clamp01(1 - bestDistance / PROPORTION_TOLERANCE) * 100)
  const symmetryScore = Math.round(clamp01(1 - metrics.asymmetry / ASYMMETRY_TOLERANCE) * 100)
  const totalScore = Math.round((proportionScore + symmetryScore) / 2)

  return {
    ratio: { upper: u, middle: 1, lower: l },
    closestTarget: closest,
    proportionScore,
    symmetryScore,
    totalScore,
    tier: tierFromScore(totalScore),
  }
}

export interface HeadPose {
  yaw: number
  pitch: number
  roll: number
}

/**
 * Euler angles (degrees) from MediaPipe's 4x4 facial transformation matrix,
 * which is stored column-major.
 */
export function poseFromMatrix(data: ArrayLike<number>): HeadPose {
  const r = (row: number, col: number) => data[col * 4 + row]
  const deg = 180 / Math.PI
  return {
    yaw: Math.atan2(-r(2, 0), Math.hypot(r(2, 1), r(2, 2))) * deg,
    pitch: Math.atan2(r(2, 1), r(2, 2)) * deg,
    roll: Math.atan2(r(1, 0), r(0, 0)) * deg,
  }
}

export const MAX_YAW_DEG = 10
export const MAX_PITCH_DEG = 12

/** Returns a Korean hint for fixing the pose, or null when the face is frontal enough to measure. */
export function poseHint(pose: HeadPose): string | null {
  if (Math.abs(pose.yaw) > MAX_YAW_DEG) return '고개를 정면으로 돌려주세요'
  if (Math.abs(pose.pitch) > MAX_PITCH_DEG) return '고개를 숙이거나 들지 말고 카메라를 똑바로 봐주세요'
  return null
}

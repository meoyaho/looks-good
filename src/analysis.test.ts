import { describe, expect, it } from 'vitest'
import {
  HAIRLINE_CORRECTION,
  LM,
  MIDLINE,
  SYMMETRY_PAIRS,
  aggregateMetrics,
  evaluate,
  levelByEyes,
  measureAsymmetry,
  measureFace,
  measureThirds,
  poseFromMatrix,
  poseHint,
  tierFromScore,
  type Point,
} from './analysis'

const CENTER_X = 300

/**
 * A perfectly symmetric synthetic face whose true thirds are given in pixels.
 * Landmark 10 is placed where MediaPipe would put it — short of the hairline
 * by HAIRLINE_CORRECTION — so measurement should recover `thirds.upper`.
 * Mirrored pairs sit at ±(40 + 5*i) px from the midline at height 150 + 10*i.
 */
function syntheticFace(thirds: { upper: number; middle: number; lower: number }): Point[] {
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: CENTER_X, y: 200 }))
  for (const i of MIDLINE) points[i] = { x: CENTER_X, y: 200 }
  const top = 50
  points[LM.foreheadTop] = { x: CENTER_X, y: top + thirds.upper - thirds.upper / HAIRLINE_CORRECTION }
  points[LM.glabella] = { x: CENTER_X, y: top + thirds.upper }
  points[LM.subnasale] = { x: CENTER_X, y: top + thirds.upper + thirds.middle }
  points[LM.chin] = { x: CENTER_X, y: top + thirds.upper + thirds.middle + thirds.lower }
  SYMMETRY_PAIRS.forEach(([l, r], i) => {
    const dx = 40 + 5 * i
    const y = 150 + 10 * i
    points[l] = { x: CENTER_X - dx, y }
    points[r] = { x: CENTER_X + dx, y }
  })
  points[LM.cheekL] = { x: CENTER_X - 120, y: 200 }
  points[LM.cheekR] = { x: CENTER_X + 120, y: 200 }
  return points
}

function rotate(points: Point[], degrees: number): Point[] {
  const a = (degrees * Math.PI) / 180
  return points.map((p) => ({
    x: CENTER_X + (p.x - CENTER_X) * Math.cos(a) - (p.y - 200) * Math.sin(a),
    y: 200 + (p.x - CENTER_X) * Math.sin(a) + (p.y - 200) * Math.cos(a),
  }))
}

describe('measureThirds', () => {
  it('reads the three vertical segments', () => {
    const t = measureThirds(syntheticFace({ upper: 60, middle: 60, lower: 48 }))
    expect(t.upper).toBeCloseTo(60)
    expect(t.middle).toBeCloseTo(60)
    expect(t.lower).toBeCloseTo(48)
  })

  it('applies the hairline correction to the upper third only', () => {
    const t = measureThirds(syntheticFace({ upper: 50, middle: 60, lower: 60 }), HAIRLINE_CORRECTION * 1.2)
    expect(t.upper).toBeCloseTo(60)
    expect(t.middle).toBeCloseTo(60)
  })
})

describe('levelByEyes', () => {
  it('undoes head roll so a tilted face measures the same', () => {
    const face = syntheticFace({ upper: 60, middle: 60, lower: 60 })
    const tilted = rotate(face, 15)
    const t = measureThirds(levelByEyes(tilted))
    expect(t.upper).toBeCloseTo(60, 5)
    expect(t.lower).toBeCloseTo(60, 5)
    expect(measureAsymmetry(levelByEyes(tilted))).toBeCloseTo(0, 5)
  })
})

describe('measureAsymmetry', () => {
  it('is 0 for a mirrored face', () => {
    expect(measureAsymmetry(syntheticFace({ upper: 60, middle: 60, lower: 60 }))).toBeCloseTo(0)
  })

  it('grows when one side is displaced', () => {
    const face = syntheticFace({ upper: 60, middle: 60, lower: 60 })
    const [, mouthR] = SYMMETRY_PAIRS[8]
    face[mouthR] = { x: face[mouthR].x + 24, y: face[mouthR].y + 10 }
    // one pair off by hypot(24, 10) = 26px, averaged over 11 pairs, / 240px width
    expect(measureAsymmetry(face)).toBeCloseTo(26 / 11 / 240, 5)
  })
})

describe('evaluate', () => {
  const perfect = { upper: 60, middle: 60, lower: 60 }

  it('gives a symmetric 1:1:1 face full marks and the high tier', () => {
    const e = evaluate(measureFace(syntheticFace(perfect)))
    expect(e.proportionScore).toBe(100)
    expect(e.symmetryScore).toBe(100)
    expect(e.tier).toBe('high')
    expect(e.closestTarget.name).toBe('1 : 1 : 1')
  })

  it('treats the 1:1:0.8 baby-face ratio as equally ideal', () => {
    const e = evaluate(measureFace(syntheticFace({ upper: 60, middle: 60, lower: 48 })))
    expect(e.proportionScore).toBe(100)
    expect(e.closestTarget.name).toBe('1 : 1 : 0.8')
  })

  it('penalises a long lower third', () => {
    const e = evaluate(measureFace(syntheticFace({ upper: 60, middle: 60, lower: 96 })))
    // lower/middle = 1.6, distance 0.6 from 1:1:1 = tolerance -> 0
    expect(e.proportionScore).toBe(0)
    expect(e.tier).toBe('mid') // symmetry still perfect: (0 + 100) / 2
  })

  it('reports the ratio relative to the middle third', () => {
    const e = evaluate(measureFace(syntheticFace({ upper: 54, middle: 60, lower: 66 })))
    expect(e.ratio.upper).toBeCloseTo(0.9)
    expect(e.ratio.lower).toBeCloseTo(1.1)
  })
})

describe('typical faces under the relaxed criteria', () => {
  const face = (upper: number, lower: number, asymmetry: number) =>
    evaluate({ thirds: { upper, middle: 1, lower }, asymmetry })

  it('an ordinary face (0.7 : 1 : 1.1, 4% asymmetry) lands in mid', () => {
    expect(face(0.7, 1.1, 0.04).tier).toBe('mid')
  })

  it('a well-balanced face (0.9 : 1 : 0.9, 2.5% asymmetry) reaches high', () => {
    expect(face(0.9, 0.9, 0.025).tier).toBe('high')
  })

  it('a clearly unbalanced face (0.6 : 1 : 1.5, 7% asymmetry) stays low', () => {
    expect(face(0.6, 1.5, 0.07).tier).toBe('low')
  })
})

describe('tierFromScore', () => {
  it('splits at 40 and 65', () => {
    expect(tierFromScore(39)).toBe('low')
    expect(tierFromScore(40)).toBe('mid')
    expect(tierFromScore(64)).toBe('mid')
    expect(tierFromScore(65)).toBe('high')
  })
})

describe('aggregateMetrics', () => {
  it('uses the median so one outlier frame does not move the result', () => {
    const base = measureFace(syntheticFace({ upper: 60, middle: 60, lower: 60 }))
    const outlier = { thirds: { upper: 999, middle: 1, lower: 999 }, asymmetry: 1 }
    const agg = aggregateMetrics([base, base, outlier])
    expect(agg).toEqual(base)
  })
})

describe('pose', () => {
  it('reads zero angles from the identity matrix', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    const pose = poseFromMatrix(identity)
    expect(pose.yaw).toBeCloseTo(0)
    expect(pose.pitch).toBeCloseTo(0)
    expect(pose.roll).toBeCloseTo(0)
    expect(poseHint(pose)).toBeNull()
  })

  it('reads yaw from a rotation about the vertical axis', () => {
    const a = (20 * Math.PI) / 180
    // column-major rotation about Y
    const rotY = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]
    const pose = poseFromMatrix(rotY)
    expect(Math.abs(pose.yaw)).toBeCloseTo(20)
    expect(poseHint(pose)).toMatch(/정면/)
  })
})

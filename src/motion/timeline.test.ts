import { describe, expect, it } from 'vitest'
import { cubicBezierAt, sample, toTrack, type Keyframe } from './timeline'
import passBy from '../../assets/motion/pass-by.json'

describe('sample', () => {
  const linear: Keyframe[] = [
    { timeMs: 0, value: 0 },
    { timeMs: 1000, value: 100 },
  ]

  it('interpolates linearly when no easing is given', () => {
    expect(sample(linear, 250)).toBeCloseTo(25)
  })

  it('clamps before the first and after the last keyframe', () => {
    expect(sample(linear, -50)).toBe(0)
    expect(sample(linear, 5000)).toBe(100)
  })

  it('holds a value until the next keyframe', () => {
    const stepped: Keyframe[] = [
      { timeMs: 0, value: 0, easingToNext: { hold: true } },
      { timeMs: 1000, value: 100, easingToNext: { hold: true } },
      { timeMs: 2000, value: 0 },
    ]
    expect(sample(stepped, 999)).toBe(0)
    expect(sample(stepped, 1000)).toBe(100)
    expect(sample(stepped, 1500)).toBe(100)
  })

  it('applies bezier easing between keyframes', () => {
    const eased: Keyframe[] = [
      { timeMs: 0, value: 0, easingToNext: { bezierValues: { p1x: 0.5, p1y: 0, p2x: 0.5, p2y: 1 } } },
      { timeMs: 1000, value: 100 },
    ]
    expect(sample(eased, 500)).toBeCloseTo(50, 3) // symmetric ease-in-out passes through the middle
    expect(sample(eased, 200)).toBeLessThan(20) // slow start
  })
})

describe('cubicBezierAt', () => {
  it('is the identity for a linear curve', () => {
    expect(cubicBezierAt(0.25, 0.25, 0.75, 0.75, 0.3)).toBeCloseTo(0.3, 4)
  })
})

describe('toTrack', () => {
  it('maps Figma field names to channels', () => {
    const body = passBy.nodes.find((n) => n.node === '2530:866')!
    const track = toTrack(body)
    expect(Object.keys(track).sort()).toEqual(['opacity', 'x', 'y'])
    expect(sample(track.x!, 0)).toBeCloseTo(1962.25, 1)
    expect(sample(track.x!, 2000)).toBeCloseTo(757.05, 1)
  })
})

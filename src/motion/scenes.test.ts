import { describe, expect, it } from 'vitest'
import { SCENES } from './scenes'
import { sample } from './timeline'

/** The sequence of photos a viewer actually sees, collapsing frames where the same layer stays up. */
function visibleCuts(tier: keyof typeof SCENES) {
  const scene = SCENES[tier]
  const cuts: { nodeId: string; src: string; at: number }[] = []
  for (let t = 0; t < scene.durationMs; t += 20) {
    const visible = scene.layers.filter((l) => !l.track.opacity || sample(l.track.opacity, t) > 0)
    // Only the full-frame photos matter here; skip decorations like blush/puddle.
    const main = visible.filter((l) => !/blush|puddle/.test(l.src))
    if (main.length !== 1) continue
    const [layer] = main
    if (cuts.at(-1)?.nodeId !== layer.nodeId) cuts.push({ nodeId: layer.nodeId, src: layer.src, at: t })
  }
  return cuts
}

describe('scenes', () => {
  for (const tier of ['low', 'mid', 'high'] as const) {
    it(`${tier}: every cut change also changes the photo`, () => {
      const cuts = visibleCuts(tier)
      for (let i = 1; i < cuts.length; i++) {
        expect(cuts[i].src, `cut at ${cuts[i].at}ms repeats the previous photo`).not.toBe(cuts[i - 1].src)
      }
    })

    it(`${tier}: exactly one dog photo is on screen at any time`, () => {
      const scene = SCENES[tier]
      for (let t = 0; t < scene.durationMs; t += 20) {
        const shown = scene.layers.filter(
          (l) =>
            !/blush|puddle/.test(l.src) &&
            (!l.track.opacity || sample(l.track.opacity, t) > 0)
        )
        expect(shown.length, `at ${t}ms`).toBe(1)
      }
    })
  }
})

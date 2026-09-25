import type { Tier } from '../analysis'
import { SCENES, STAGE_H, STAGE_W, type Layer, type Scene } from './scenes'
import { sample } from './timeline'

/**
 * The park backdrop plus the dog layers, authored in a fixed 1920x1350 space
 * and scaled to cover whatever box `container` is.
 */
export class DogStage {
  private readonly world: HTMLDivElement
  private layerEls: HTMLImageElement[] = []
  private raf = 0

  constructor(private readonly container: HTMLElement) {
    this.world = document.createElement('div')
    this.world.className = 'stage-world'
    this.world.style.width = `${STAGE_W}px`
    this.world.style.height = `${STAGE_H}px`
    this.world.style.backgroundImage = `url(${import.meta.env.BASE_URL}images/background.webp)`
    container.appendChild(this.world)
    new ResizeObserver(() => this.fit()).observe(container)
    this.fit()
  }

  private fit() {
    const { width, height } = this.container.getBoundingClientRect()
    if (!width || !height) return
    const scale = Math.max(width / STAGE_W, height / STAGE_H)
    this.world.style.transform = `translate(-50%, -50%) scale(${scale})`
  }

  private mount(scene: Scene) {
    this.layerEls.forEach((el) => el.remove())
    this.layerEls = scene.layers.map((layer) => {
      const el = document.createElement('img')
      el.className = 'stage-layer'
      el.src = layer.src
      el.alt = layer.alt
      el.draggable = false
      el.style.width = `${layer.box.width}px`
      el.style.height = `${layer.box.height}px`
      if (layer.box.rotate) el.style.transformOrigin = '50% 50%'
      this.world.appendChild(el)
      return el
    })
  }

  private render(scene: Scene, timeMs: number) {
    scene.layers.forEach((layer, i) => applyLayer(this.layerEls[i], layer, timeMs))
  }

  /** Plays the tier's motion once; resolves on the last frame (which stays on screen). */
  play(tier: Tier): Promise<void> {
    const scene = SCENES[tier]
    this.stop()
    this.mount(scene)
    this.render(scene, 0)
    return new Promise((resolve) => {
      let start: number | null = null
      const tick = (now: number) => {
        start ??= now
        const t = Math.min(now - start, scene.durationMs)
        this.render(scene, t)
        if (t >= scene.durationMs) resolve()
        else this.raf = requestAnimationFrame(tick)
      }
      this.raf = requestAnimationFrame(tick)
    })
  }

  /** Freeze a tier at a given time — used by the `?scene=` preview mode. */
  showFrame(tier: Tier, timeMs: number) {
    const scene = SCENES[tier]
    this.stop()
    this.mount(scene)
    this.render(scene, timeMs)
  }

  clear() {
    this.stop()
    this.layerEls.forEach((el) => el.remove())
    this.layerEls = []
  }

  private stop() {
    cancelAnimationFrame(this.raf)
  }
}

function applyLayer(el: HTMLImageElement, layer: Layer, t: number) {
  const { track, box } = layer
  const opacity = track.opacity ? sample(track.opacity, t) / 100 : 1
  el.style.opacity = String(opacity)
  if (opacity <= 0) {
    el.style.visibility = 'hidden'
    return
  }
  el.style.visibility = 'visible'
  // Tracked layers move by their keyframes; box.left/top is then an offset from that point.
  const x = track.x ? sample(track.x, t) + box.left : box.left
  const y = track.y ? sample(track.y, t) + box.top : box.top
  const sx = track.scaleX ? sample(track.scaleX, t) : 1
  const sy = track.scaleY ? sample(track.scaleY, t) : 1
  const rot = track.rotation ? sample(track.rotation, t) : 0
  el.style.transform = `translate(${x}px, ${y}px) scale(${sx}, ${sy}) rotate(${rot}rad)` + (box.rotate ? ` rotate(${box.rotate}deg)` : '')
}

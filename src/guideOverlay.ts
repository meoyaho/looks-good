import { HAIRLINE_CORRECTION, LM, MIDLINE, type Point } from './analysis'

const LINE_COLOR = '#ffd66b'
const SEGMENT_LABELS = ['상안부', '중안부', '하안부']

/**
 * Draws the three-thirds guide and the symmetry axis over the (mirrored)
 * camera preview. The canvas is not CSS-mirrored — instead x is flipped
 * here — so the labels stay readable.
 */
export function drawGuide(canvas: HTMLCanvasElement, points: Point[] | null, videoW: number, videoH: number, ok: boolean) {
  if (canvas.width !== videoW || canvas.height !== videoH) {
    canvas.width = videoW
    canvas.height = videoH
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!points) return

  const flip = (p: Point): Point => ({ x: videoW - p.x, y: p.y })
  const eyeL = flip(points[LM.eyeOuterL])
  const eyeR = flip(points[LM.eyeOuterR])
  // Unit vector along the eye line; the thirds lines run parallel to it.
  const len = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y) || 1
  const ux = (eyeR.x - eyeL.x) / len
  const uy = (eyeR.y - eyeL.y) / len
  const halfWidth = Math.hypot(points[LM.cheekR].x - points[LM.cheekL].x, points[LM.cheekR].y - points[LM.cheekL].y) * 0.62

  const scale = videoW / 640
  ctx.lineWidth = 2.5 * scale
  ctx.font = `600 ${15 * scale}px "Gowun Dodum", sans-serif`
  ctx.textBaseline = 'middle'
  const alpha = ok ? 1 : 0.55

  const [meshTop, brow, nose, chin] = [LM.foreheadTop, LM.glabella, LM.subnasale, LM.chin].map((i) => flip(points[i]))
  // Draw the top line at the estimated hairline, matching what measureThirds uses.
  const hairline = {
    x: brow.x + (meshTop.x - brow.x) * HAIRLINE_CORRECTION,
    y: brow.y + (meshTop.y - brow.y) * HAIRLINE_CORRECTION,
  }
  const levels = [hairline, brow, nose, chin]
  levels.forEach((p) => {
    ctx.strokeStyle = LINE_COLOR
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.moveTo(p.x - ux * halfWidth, p.y - uy * halfWidth)
    ctx.lineTo(p.x + ux * halfWidth, p.y + uy * halfWidth)
    ctx.stroke()
  })

  // Segment labels on the right-hand side of the face.
  ctx.fillStyle = '#fff'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 4 * scale
  for (let i = 0; i < 3; i++) {
    const a = levels[i]
    const b = levels[i + 1]
    const mx = (a.x + b.x) / 2 + ux * (halfWidth + 8 * scale)
    const my = (a.y + b.y) / 2 + uy * (halfWidth + 8 * scale)
    ctx.fillText(SEGMENT_LABELS[i], mx, my)
  }
  ctx.shadowBlur = 0

  // Symmetry axis through the midline landmarks.
  ctx.setLineDash([6 * scale, 6 * scale])
  ctx.strokeStyle = '#8fd3ff'
  ctx.beginPath()
  const top = flip(points[MIDLINE[0]])
  const bottom = flip(points[MIDLINE[MIDLINE.length - 1]])
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(bottom.x, bottom.y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
}

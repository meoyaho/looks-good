import { aggregateMetrics, evaluate, measureFace, poseHint, type Evaluation, type FaceMetrics, type Tier } from './analysis'
import { captureComplete, captureProgress } from './captureTiming'
import { FaceTracker, type FaceFrame } from './faceTracker'
import { drawGuide } from './guideOverlay'
import { DogStage } from './motion/dogStage'

type AppState = 'intro' | 'loading' | 'aligning' | 'confirmed' | 'scene' | 'result'

const CONFIRMATION_MS = 1000
const MIN_FACE_SIZE = 0.3
const MAX_FACE_SIZE = 0.85
const CAPTION_MS = 1600

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const app = document.querySelector<HTMLElement>('.app')!
const video = $<HTMLVideoElement>('video')
const guide = $<HTMLCanvasElement>('guide')
const cameraView = document.querySelector<HTMLElement>('.camera-view')!
const captureStatus = $('captureStatus')
const hint = $('hint')
const progressFill = $('progress').firstElementChild as HTMLElement
const caption = $('caption')
const result = $('result')

/** `?debug` shows the measurement guide on the camera and logs scores — never shown to regular visitors. */
const DEBUG = new URLSearchParams(location.search).has('debug')

const stage = new DogStage($('stage'))
const tracker = new FaceTracker(video)
let samples: FaceMetrics[] = []
let captureStartedAt: number | null = null

function setState(state: AppState) {
  app.dataset.state = state
}

function setHint(text: string, tone: 'wait' | 'ok' = 'wait') {
  hint.textContent = text
  hint.dataset.tone = tone
}

function setProgress(fraction: number) {
  progressFill.style.transform = `scaleX(${fraction})`
}

function setCaptureStatus(state: 'searching' | 'adjusting' | 'measuring' | 'complete', text: string) {
  cameraView.dataset.capture = state
  captureStatus.textContent = text
}

function resetCapture() {
  samples = []
  captureStartedAt = null
  setProgress(0)
}

/** Why this frame can't be measured, or null if it can. */
function frameProblem(frame: FaceFrame): string | null {
  if (frame.faceSize < MIN_FACE_SIZE) return '조금 더 가까이 와주세요'
  if (frame.faceSize > MAX_FACE_SIZE) return '조금만 뒤로 가주세요'
  return frame.pose ? poseHint(frame.pose) : null
}

function trackLoop() {
  if (app.dataset.state !== 'aligning') return
  try {
    const frame = tracker.detect()
    if (frame !== undefined) handleFrame(frame)
  } catch (err) {
    // A single failed frame shouldn't kill the loop; log and try the next one.
    console.error(err)
  }
  requestAnimationFrame(trackLoop)
}

function handleFrame(frame: FaceFrame | null) {
  if (!frame) {
    resetCapture()
    setCaptureStatus('searching', '얼굴 찾는 중')
    setHint('얼굴이 보이지 않아요. 얼굴이 잘 보이게 맞춰주세요')
    if (DEBUG) drawGuide(guide, null, video.videoWidth, video.videoHeight, false)
    return
  }

  const problem = frameProblem(frame)
  if (DEBUG) drawGuide(guide, frame.points, video.videoWidth, video.videoHeight, !problem)
  if (problem) {
    // Only measure an uninterrupted run of good frames.
    resetCapture()
    setCaptureStatus('adjusting', '얼굴 인식됨 · 자세 조정')
    setHint(problem)
    return
  }

  captureStartedAt ??= performance.now()
  samples.push(measureFace(frame.points))
  const elapsed = performance.now() - captureStartedAt
  setProgress(captureProgress(elapsed, samples.length))
  setCaptureStatus('measuring', '얼굴 분석 중')
  setHint('얼굴을 확인했어요. 잠시만 그대로 있어주세요', 'ok')
  if (captureComplete(elapsed, samples.length)) {
    const evaluation = evaluate(aggregateMetrics(samples))
    resetCapture()
    setProgress(1)
    void confirmCapture(evaluation)
  }
}

async function confirmCapture(evaluation: Evaluation) {
  setState('confirmed')
  setCaptureStatus('complete', '✓ 얼굴 분석 완료')
  setHint('얼굴 분석 완료! 강아지를 불러볼게요', 'ok')
  await new Promise((r) => setTimeout(r, CONFIRMATION_MS))
  await runScene(evaluation)
}

const CAPTION_TEXT = '강아지가 지나갈 것 같다...!'

async function runScene(evaluation: Evaluation) {
  setState('scene')
  caption.textContent = CAPTION_TEXT
  caption.classList.add('show')
  await new Promise((r) => setTimeout(r, CAPTION_MS))
  caption.classList.remove('show')
  await stage.play(evaluation.tier)
  showResult(evaluation)
}

const RESULT_COPY: Record<Tier, { emoji: string; text: string }> = {
  high: { emoji: '💦', text: '강아지가 당신에게 매우 관심이 있습니다.' },
  mid: { emoji: '👀', text: '강아지가 어느정도 관심을 가졌습니다.' },
  low: { emoji: '🐾', text: '당신은 강아지의 선택을 받지 못했습니다.' },
}

function showResult(e: Evaluation) {
  const copy = RESULT_COPY[e.tier]
  $('resultEmoji').textContent = copy.emoji
  $('resultText').textContent = copy.text
  // The criteria stay internal: numbers only surface in ?debug mode.
  if (DEBUG) console.table({ ...e.ratio, proportion: e.proportionScore, symmetry: e.symmetryScore, total: e.totalScore, tier: e.tier })
  result.hidden = false
  setState('result')
}

async function start() {
  $('introError').textContent = ''
  setState('loading')
  setHint('강아지를 부르는 중… (처음엔 몇 초 걸려요)')
  try {
    await tracker.start()
  } catch (err) {
    setState('intro')
    const message = err instanceof Error ? err.message : String(err)
    $('startBtn').textContent = '다시 시도'
    $('introError').textContent =
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? '카메라 권한이 거부됐어요. 주소창의 카메라 아이콘에서 허용해주세요.'
        : `카메라를 켤 수 없어요: ${message}`
    return
  }
  beginAligning()
}

function beginAligning() {
  result.hidden = true
  stage.clear()
  resetCapture()
  setState('aligning')
  setCaptureStatus('searching', '얼굴 찾는 중')
  setHint('정면을 보고 얼굴이 잘 보이게 맞춰주세요')
  requestAnimationFrame(trackLoop)
}

$('startBtn').addEventListener('click', start)
$('retryBtn').addEventListener('click', beginAligning)

// Preview mode for tuning the animations without a camera:
//   ?scene=high            plays the high-tier motion
//   ?scene=mid&t=6000      freezes the mid-tier motion at 6s
//   ?scene=low&demo        plays the motion, then shows a sample result card
// Add &debug (or use ?debug alone with the camera) to see the guide lines and scores.
const DEMO_METRICS: Record<Tier, FaceMetrics> = {
  high: { thirds: { upper: 1, middle: 1, lower: 0.85 }, asymmetry: 0.01 },
  mid: { thirds: { upper: 1.2, middle: 1, lower: 1.3 }, asymmetry: 0.04 },
  low: { thirds: { upper: 0.6, middle: 1, lower: 1.5 }, asymmetry: 0.07 },
}
const params = new URLSearchParams(location.search)
const previewTier = params.get('scene') as Tier | null
if (previewTier && previewTier in DEMO_METRICS) {
  setState('scene')
  const t = params.get('t')
  if (t !== null) stage.showFrame(previewTier, Number(t))
  else if (params.has('demo')) void runScene(evaluate(DEMO_METRICS[previewTier]))
  else void stage.play(previewTier)
}

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { poseFromMatrix, type HeadPose, type Point } from './analysis'

const BASE = import.meta.env.BASE_URL

export interface FaceFrame {
  /** Landmarks in video pixel space. */
  points: Point[]
  pose: HeadPose | null
  /** Face height as a fraction of the frame height — used to ask the user to come closer. */
  faceSize: number
}

/** Owns the webcam stream and the MediaPipe landmarker; call `detect()` once per animation frame. */
export class FaceTracker {
  private landmarker: FaceLandmarker | null = null
  private stream: MediaStream | null = null
  private lastVideoTime = -1

  constructor(private readonly video: HTMLVideoElement) {}

  async start(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe`)
    const create = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE}models/face_landmarker.task`, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      })
    try {
      this.landmarker = await create('GPU')
    } catch {
      // GPU inference unavailable (blocked or flaky driver) — CPU inference is slower but more robust.
      this.landmarker = await create('CPU')
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    this.video.srcObject = this.stream
    await this.video.play()
  }

  /** Returns the face in the current video frame, `null` if none, or `undefined` if the frame hasn't changed. */
  detect(): FaceFrame | null | undefined {
    const video = this.video
    if (!this.landmarker || video.readyState < 2) return undefined
    if (video.currentTime === this.lastVideoTime) return undefined
    this.lastVideoTime = video.currentTime

    const w = video.videoWidth
    const h = video.videoHeight
    const result = this.landmarker.detectForVideo(video, performance.now())
    const landmarks = result.faceLandmarks[0]
    if (!landmarks) return null

    const points = landmarks.map((p) => ({ x: p.x * w, y: p.y * h }))
    const matrix = result.facialTransformationMatrixes?.[0]
    let minY = Infinity
    let maxY = -Infinity
    for (const p of landmarks) {
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }

    return {
      points,
      pose: matrix ? poseFromMatrix(matrix.data) : null,
      faceSize: maxY - minY,
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.landmarker?.close()
    this.landmarker = null
  }
}

export const MIN_CAPTURE_SAMPLES = 24
export const MIN_CAPTURE_MS = 1800

/** Both elapsed time and enough valid face measurements are required. */
export function captureProgress(elapsedMs: number, sampleCount: number): number {
  return Math.min(1, elapsedMs / MIN_CAPTURE_MS, sampleCount / MIN_CAPTURE_SAMPLES)
}

export function captureComplete(elapsedMs: number, sampleCount: number): boolean {
  return elapsedMs >= MIN_CAPTURE_MS && sampleCount >= MIN_CAPTURE_SAMPLES
}

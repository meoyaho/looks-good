import { describe, expect, it } from 'vitest'
import { captureComplete, captureProgress, MIN_CAPTURE_SAMPLES, MIN_CAPTURE_MS } from './captureTiming'

describe('face capture timing', () => {
  it('holds the camera until both time and enough measurements have passed', () => {
    expect(captureComplete(MIN_CAPTURE_MS - 1, MIN_CAPTURE_SAMPLES + 30)).toBe(false)
    expect(captureComplete(MIN_CAPTURE_MS + 500, MIN_CAPTURE_SAMPLES - 1)).toBe(false)
    expect(captureComplete(MIN_CAPTURE_MS, MIN_CAPTURE_SAMPLES)).toBe(true)
  })

  it('shows progress for the slower requirement', () => {
    expect(captureProgress(MIN_CAPTURE_MS / 2, MIN_CAPTURE_SAMPLES)).toBe(0.5)
    expect(captureProgress(MIN_CAPTURE_MS, MIN_CAPTURE_SAMPLES / 2)).toBe(0.5)
    expect(captureProgress(MIN_CAPTURE_MS * 2, MIN_CAPTURE_SAMPLES * 2)).toBe(1)
  })
})

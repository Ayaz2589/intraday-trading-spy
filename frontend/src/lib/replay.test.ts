import { describe, it, expect } from 'vitest'
import {
  SPEED_PRESETS,
  BASE_INTERVAL_MS,
  clampCursor,
  advanceCursor,
  isAtBound,
  speedToIntervalMs,
  nextSpeed,
  initialReplayState,
  replayReducer,
  type ReplayState,
} from './replay'

const st = (over: Partial<ReplayState> = {}): ReplayState => ({
  cursor: 5,
  isPlaying: false,
  speed: 1,
  direction: 1,
  active: false,
  ...over,
})

describe('clampCursor', () => {
  it('keeps an in-range cursor', () => expect(clampCursor(3, 10)).toBe(3))
  it('clamps below 0', () => expect(clampCursor(-2, 10)).toBe(0))
  it('clamps above the last index', () => expect(clampCursor(99, 10)).toBe(9))
  it('returns 0 for an empty set', () => expect(clampCursor(4, 0)).toBe(0))
})

describe('advanceCursor', () => {
  it('steps forward', () => expect(advanceCursor(3, 1, 10)).toBe(4))
  it('steps backward', () => expect(advanceCursor(3, -1, 10)).toBe(2))
  it('clamps at the end', () => expect(advanceCursor(9, 1, 10)).toBe(9))
  it('clamps at the start', () => expect(advanceCursor(0, -1, 10)).toBe(0))
})

describe('isAtBound', () => {
  it('detects the end going forward', () => expect(isAtBound(9, 1, 10)).toBe(true))
  it('detects the start going backward', () => expect(isAtBound(0, -1, 10)).toBe(true))
  it('is false mid-range', () => {
    expect(isAtBound(5, 1, 10)).toBe(false)
    expect(isAtBound(5, -1, 10)).toBe(false)
  })
})

describe('speedToIntervalMs', () => {
  it('1x = base', () => expect(speedToIntervalMs(1)).toBe(BASE_INTERVAL_MS))
  it('scales inversely with speed', () => {
    expect(speedToIntervalMs(2)).toBe(Math.round(BASE_INTERVAL_MS / 2))
    expect(speedToIntervalMs(4)).toBe(Math.round(BASE_INTERVAL_MS / 4))
  })
  it('floors at a sane minimum', () => expect(speedToIntervalMs(1000)).toBeGreaterThanOrEqual(40))
})

describe('nextSpeed', () => {
  it('cycles through the presets', () => {
    expect(nextSpeed(1)).toBe(2)
    expect(nextSpeed(2)).toBe(4)
    expect(nextSpeed(4)).toBe(8)
    expect(nextSpeed(8)).toBe(1)
  })
  it('exposes the presets', () => expect(SPEED_PRESETS).toEqual([1, 2, 4, 8]))
})

describe('initialReplayState', () => {
  it('starts fully revealed, paused, and inactive', () => {
    expect(initialReplayState(10)).toEqual({
      cursor: 9,
      isPlaying: false,
      speed: 1,
      direction: 1,
      active: false,
    })
  })
})

describe('replayReducer', () => {
  it('PAUSE stops playing', () => {
    expect(replayReducer(st({ isPlaying: true }), { type: 'PAUSE' }, 10).isPlaying).toBe(false)
  })
  it('STEP moves one bar and pauses', () => {
    const next = replayReducer(st({ isPlaying: true }), { type: 'STEP', dir: 1 }, 10)
    expect(next.cursor).toBe(6)
    expect(next.isPlaying).toBe(false)
  })
  it('SCRUB jumps (clamped) and pauses', () => {
    const next = replayReducer(st({ isPlaying: true }), { type: 'SCRUB', cursor: 99 }, 10)
    expect(next.cursor).toBe(9)
    expect(next.isPlaying).toBe(false)
  })
  it('SET_SPEED keeps cursor + playing', () => {
    const next = replayReducer(st({ isPlaying: true }), { type: 'SET_SPEED', speed: 4 }, 10)
    expect(next).toMatchObject({ speed: 4, isPlaying: true, cursor: 5 })
  })
  it('TICK forward advances', () => {
    expect(replayReducer(st({ isPlaying: true }), { type: 'TICK' }, 10).cursor).toBe(6)
  })
  it('TICK auto-pauses at the end (forward)', () => {
    const next = replayReducer(st({ cursor: 8, isPlaying: true, direction: 1 }), { type: 'TICK' }, 10)
    expect(next.cursor).toBe(9)
    expect(next.isPlaying).toBe(false)
  })
  it('TICK auto-pauses at the start (reverse)', () => {
    const next = replayReducer(st({ cursor: 1, isPlaying: true, direction: -1 }), { type: 'TICK' }, 10)
    expect(next.cursor).toBe(0)
    expect(next.isPlaying).toBe(false)
  })
  it('PLAY at the end restarts from the start (forward)', () => {
    const next = replayReducer(st({ cursor: 9, direction: 1 }), { type: 'PLAY' }, 10)
    expect(next).toMatchObject({ cursor: 0, isPlaying: true })
  })
  it('REVERSE plays backward; from the start it restarts at the end', () => {
    const mid = replayReducer(st({ cursor: 5 }), { type: 'REVERSE' }, 10)
    expect(mid).toMatchObject({ direction: -1, isPlaying: true, cursor: 5 })
    const atStart = replayReducer(st({ cursor: 0 }), { type: 'REVERSE' }, 10)
    expect(atStart).toMatchObject({ direction: -1, isPlaying: true, cursor: 9 })
  })
  it('FAST_FORWARD bumps speed and plays forward', () => {
    const next = replayReducer(st({ cursor: 5, speed: 2, direction: -1 }), { type: 'FAST_FORWARD' }, 10)
    expect(next).toMatchObject({ direction: 1, speed: 4, isPlaying: true })
  })
  it('RESET returns to fully-revealed, paused, inactive state', () => {
    expect(replayReducer(st({ cursor: 2, isPlaying: true, speed: 8, direction: -1, active: true }), { type: 'RESET' }, 10))
      .toEqual({ cursor: 9, isPlaying: false, speed: 1, direction: 1, active: false })
  })

  it('engaging the timeline sets active; RESET clears it', () => {
    expect(replayReducer(st(), { type: 'PLAY' }, 10).active).toBe(true)
    expect(replayReducer(st(), { type: 'STEP', dir: -1 }, 10).active).toBe(true)
    expect(replayReducer(st(), { type: 'SCRUB', cursor: 3 }, 10).active).toBe(true)
    expect(replayReducer(st(), { type: 'REVERSE' }, 10).active).toBe(true)
    expect(replayReducer(st(), { type: 'FAST_FORWARD' }, 10).active).toBe(true)
    // PAUSE keeps active (still mid-replay); RESET clears it.
    expect(replayReducer(st({ active: true, isPlaying: true }), { type: 'PAUSE' }, 10).active).toBe(true)
    expect(replayReducer(st({ active: true }), { type: 'RESET' }, 10).active).toBe(false)
  })
})

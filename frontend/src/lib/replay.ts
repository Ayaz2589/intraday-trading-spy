import { useEffect, useReducer } from 'react'

/**
 * Pure playback logic for the chart replay feature. React-free so it's unit
 * testable; the `useReplay` hook at the bottom wraps it with a timer.
 *
 * A `cursor` is the inclusive index of the last revealed bar (0..count-1).
 * `direction` is +1 (forward) or -1 (reverse). `speed` is a preset multiplier.
 */

export const SPEED_PRESETS = [1, 2, 4, 8] as const
export type Speed = (typeof SPEED_PRESETS)[number]

export const BASE_INTERVAL_MS = 700
export const MIN_INTERVAL_MS = 40

export type Direction = 1 | -1

export interface ReplayState {
  cursor: number
  isPlaying: boolean
  speed: Speed
  direction: Direction
  // True once the user engages the timeline (play/step/scrub/reverse/ff).
  // While false the chart shows the full session — replay only kicks in on
  // explicit interaction, and a RESET returns to this state.
  active: boolean
}

export function clampCursor(cursor: number, count: number): number {
  if (count <= 0) return 0
  if (cursor < 0) return 0
  if (cursor > count - 1) return count - 1
  return cursor
}

export function isAtBound(cursor: number, dir: Direction, count: number): boolean {
  return dir === 1 ? cursor >= count - 1 : cursor <= 0
}

export function advanceCursor(cursor: number, dir: Direction, count: number): number {
  return clampCursor(cursor + dir, count)
}

export function speedToIntervalMs(speed: number, base = BASE_INTERVAL_MS): number {
  return Math.max(MIN_INTERVAL_MS, Math.round(base / speed))
}

export function nextSpeed(speed: Speed): Speed {
  const i = SPEED_PRESETS.indexOf(speed)
  return SPEED_PRESETS[(i + 1) % SPEED_PRESETS.length]
}

export function initialReplayState(count: number): ReplayState {
  return { cursor: clampCursor(count - 1, count), isPlaying: false, speed: 1, direction: 1, active: false }
}

export type ReplayAction =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE' }
  | { type: 'STEP'; dir: Direction }
  | { type: 'SCRUB'; cursor: number }
  | { type: 'SET_SPEED'; speed: Speed }
  | { type: 'REVERSE' }
  | { type: 'FAST_FORWARD' }
  | { type: 'TICK' }
  | { type: 'RESET' }

export function replayReducer(state: ReplayState, action: ReplayAction, count: number): ReplayState {
  switch (action.type) {
    case 'PLAY': {
      // Starting from a terminal bound restarts from the opposite end.
      if (isAtBound(state.cursor, state.direction, count)) {
        return { ...state, isPlaying: true, active: true, cursor: state.direction === 1 ? 0 : clampCursor(count - 1, count) }
      }
      return { ...state, isPlaying: true, active: true }
    }
    case 'PAUSE':
      return { ...state, isPlaying: false }
    case 'TOGGLE':
      return replayReducer(state, { type: state.isPlaying ? 'PAUSE' : 'PLAY' }, count)
    case 'STEP':
      return { ...state, isPlaying: false, active: true, cursor: advanceCursor(state.cursor, action.dir, count) }
    case 'SCRUB':
      return { ...state, isPlaying: false, active: true, cursor: clampCursor(action.cursor, count) }
    case 'SET_SPEED':
      return { ...state, speed: action.speed }
    case 'REVERSE': {
      const atStart = isAtBound(state.cursor, -1, count)
      return { ...state, isPlaying: true, active: true, direction: -1, cursor: atStart ? clampCursor(count - 1, count) : state.cursor }
    }
    case 'FAST_FORWARD': {
      const atEnd = isAtBound(state.cursor, 1, count)
      return { ...state, isPlaying: true, active: true, direction: 1, speed: nextSpeed(state.speed), cursor: atEnd ? 0 : state.cursor }
    }
    case 'TICK': {
      const next = advanceCursor(state.cursor, state.direction, count)
      const stop = isAtBound(next, state.direction, count)
      return { ...state, cursor: next, isPlaying: stop ? false : state.isPlaying }
    }
    case 'RESET':
      return initialReplayState(count)
    default:
      return state
  }
}

/**
 * Stateful playback hook. Owns the cursor/play state and a setInterval that
 * dispatches TICKs at the current speed while playing. The reducer is rebound
 * to `count` each render so dispatches always clamp to the current bar count.
 */
export function useReplay(count: number) {
  const [state, dispatch] = useReducer(
    (s: ReplayState, a: ReplayAction) => replayReducer(s, a, count),
    count,
    initialReplayState,
  )

  useEffect(() => {
    if (!state.isPlaying) return
    const id = setInterval(() => dispatch({ type: 'TICK' }), speedToIntervalMs(state.speed))
    return () => clearInterval(id)
    // Re-key on count too so the timer is torn down when the session changes.
  }, [state.isPlaying, state.speed, state.direction, count])

  return { state, dispatch }
}

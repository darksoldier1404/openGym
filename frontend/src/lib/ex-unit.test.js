import { describe, it, expect } from 'vitest'
import { convertIncrement, exUnitOf, hasOwnUnit, exactWeight, weightView, exIncrement, stateInExUnit, buildInExUnit, targetToExUnit, targetFromExUnit, retargetUnit, plateStateFor } from './ex-unit.js'
import { buildSessionEntries } from './session-start.js'
import { isWarmupRow } from './workout-model.js'
import { mergeStates } from './sync-merge.js'

// '0025' is a barbell bench press in the dataset: a heavy-ish upper lift, default step 2.5 kg / 5 lb.
const lbBench = { unit: 'kg', exUnit: { '0025': 'lb' }, workouts: [], exWeights: {}, routines: [] }

describe('the per-exercise weight unit', () => {
  it('follows the profile unless the exercise has one of its own', () => {
    expect(exUnitOf({ unit: 'kg' }, '0025')).toBe('kg')
    expect(exUnitOf({ unit: 'lb' }, '0025')).toBe('lb')
    expect(exUnitOf(lbBench, '0025')).toBe('lb')
    expect(exUnitOf(lbBench, '0001')).toBe('kg')
    expect(exUnitOf({ unit: 'kg', exUnit: { '0025': 'stone' } }, '0025')).toBe('kg')
    expect(hasOwnUnit(lbBench, '0025')).toBe(true)
    expect(hasOwnUnit({ unit: 'lb', exUnit: { '0025': 'lb' } }, '0025')).toBe(false)
  })

  it('stores a weight typed in the exercise’s unit exactly, and reads it back as typed', () => {
    const v = weightView(lbBench, '0025')
    expect(v.unit).toBe('lb')
    for (const lb of [45, 55, 52.5, 135, 2.5, 317.5]) expect(v.show(v.keep(lb))).toBe(lb)
    expect(v.keep(55)).toBe(exactWeight(55, 'lb', 'kg'))
    expect(v.keep(55)).toBeCloseTo(24.9476, 4)
    // A kg number logged before the switch reads as its exact equivalent.
    expect(v.show(60)).toBe(132.28)
    expect(v.show(null)).toBe(null)
  })

  it('is a pass-through for an exercise in the profile’s unit', () => {
    const v = weightView({ unit: 'kg' }, '0025')
    expect(v.own).toBe(false)
    expect(v.show(61.3)).toBe(61.3)
    expect(v.keep(61.3)).toBe(61.3)
    const set = { w: 60, r: 5 }
    expect(v.set(set)).toBe(set)
  })

  it('steps in the exercise’s unit: its own increment converted, else that unit’s default', () => {
    expect(exIncrement(lbBench, { id: '0025' })).toBe(5)
    expect(exIncrement(lbBench, { id: '0025', inc: 2.5 })).toBe(5)
    expect(exIncrement({ unit: 'kg' }, { id: '0025' })).toBe(2.5)
    expect(convertIncrement(5, 'lb', 'kg')).toBe(2.5)
    expect(convertIncrement(1.25, 'kg', 'lb')).toBe(2.5)
    expect(convertIncrement(3, 'kg', 'lb')).toBe(6.5)   // far from every lb step: converted as a weight
  })

  it('sees only the exercise’s own sessions, converted, in its unit', () => {
    const S = { ...lbBench, exWeights: { '0025': { w: 60 } }, workouts: [{ d: '2026-01-01', entries: [
      { id: '0025', target: { weight: 60 }, sets: [{ w: 60, r: 5, done: true }] },
      { id: '0001', target: { weight: 100 }, sets: [{ w: 100, r: 5, done: true }] },
    ] }] }
    const view = stateInExUnit(S, '0025')
    expect(view.unit).toBe('lb')
    expect(view.workouts[0].entries).toHaveLength(1)
    expect(view.workouts[0].entries[0].sets[0].w).toBe(132.5)
    expect(view.exWeights['0025'].w).toBe(132.5)
    expect(stateInExUnit({ unit: 'kg' }, '0025')).toEqual({ unit: 'kg' })
  })

  it('progresses an lb exercise on a kg profile by 5 lb, kept exact in kg', () => {
    const lb = n => exactWeight(n, 'lb', 'kg')
    const cfg = { id: '0025', sets: 2, reps: 5, weight: lb(135), prog: 'linear' }
    const st = { ...lbBench, workouts: [{ d: '2026-01-01', routineIds: ['r'], entries: [
      { id: '0025', target: { sets: 2, reps: 5, weight: lb(135) }, sets: [{ w: lb(135), r: 5, done: true }, { w: lb(135), r: 5, done: true }] },
    ] }] }
    const [entry] = buildSessionEntries(st, { id: 'r', prog: 'linear', ex: [cfg] })
    const v = weightView(st, '0025')
    expect(entry.plan.kind).toBe('up')
    expect(v.show(entry.plan.weight)).toBe(140)
    expect(v.show(entry.target.weight)).toBe(140)
    expect(entry.sets.filter(s => !isWarmupRow(s)).map(s => v.show(s.w))).toEqual([140, 140])
    // The same session on a kg exercise steps by 2.5 kg.
    const [kg] = buildSessionEntries({ ...st, exUnit: {} }, { id: 'r', prog: 'linear', ex: [cfg] })
    expect(kg.plan.weight).toBeCloseTo(lb(135) + 2.5, 1)
  })

  it('ramps planned warm-ups on the exercise’s own plates', () => {
    const lb = n => exactWeight(n, 'lb', 'kg')
    const r = { id: 'r', prog: 'off', ex: [{ id: '0025', sets: 1, reps: 5, weight: lb(225), warmupSets: 2 }] }
    const [entry] = buildSessionEntries(lbBench, r)
    const v = weightView(lbBench, '0025')
    const warm = entry.sets.filter(isWarmupRow).map(s => v.show(s.w))
    expect(warm).toHaveLength(2)
    for (const w of warm) expect(w % 5).toBe(0)
  })

  it('builds an exercise in the profile’s unit exactly as before', () => {
    const S = { unit: 'kg', workouts: [] }
    const built = { target: { weight: 61.3 }, sets: [{ w: 61.3 }] }
    expect(buildInExUnit(S, { id: '0025' }, () => built)).toBe(built)
  })

  it('shows a routine config in the exercise’s unit and saves it back without drift', () => {
    const cfg = { id: '0025', sets: 3, reps: 5, weight: exactWeight(135, 'lb', 'kg'), inc: exactWeight(10, 'lb', 'kg') }
    const shown = targetToExUnit(lbBench, cfg)
    expect(shown.weight).toBe(135)
    expect(shown.inc).toBe(10)
    const back = targetFromExUnit(lbBench, shown)
    expect(back.weight).toBe(cfg.weight)
    // An increment lands on the other unit's steps: 10 lb is a 5 kg step, not 4.54.
    expect(back.inc).toBe(5)
    expect(targetToExUnit(lbBench, back).inc).toBe(10)
    expect(retargetUnit({ weight: 100 }, 'kg', 'lb').weight).toBe(220.46)
  })

  it('reads the plates of the exercise’s unit', () => {
    const S = { ...lbBench, barWeights: { '0025': 20 } }
    const P = plateStateFor(S, '0025')
    expect(P.unit).toBe('lb')
    expect(P.barWeights).toEqual({})   // 20 kg is the default bar: the lb default (45) takes over
    expect(plateStateFor({ unit: 'kg' }, '0025')).toEqual({ unit: 'kg' })
  })

  it('syncs as a per-exercise map', () => {
    const a = { unit: 'kg', _ts: 2, exUnit: { '0025': 'lb' } }
    const b = { unit: 'kg', _ts: 1, exUnit: { '0001': 'lb' } }
    expect(mergeStates(a, b).exUnit).toEqual({ '0025': 'lb', '0001': 'lb' })
  })
})

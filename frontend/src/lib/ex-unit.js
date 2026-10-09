// A weight unit of its own for one exercise: a gym with lb dumbbells and a kg rack, a machine
// whose stack is marked in pounds on a kg profile. S.exUnit[exId] is 'kg' or 'lb'; absent, or
// the profile's own unit, the exercise follows the profile as before.
//
// Every weight in the state stays in the profile's unit (S.unit), the exercise's own included,
// so volume, 1RM, Stats, sync and the unit switch (lib/units.js) work exactly as they did. The
// exercise's unit is a lens on top: what the workout and the exercise settings show and take is
// converted on the way in and out (weightView), and an entry is built — history, progression,
// warm-ups, drops, plates — with the state seen in the exercise's unit, so the steps it adds are
// that unit's (5 lb, not 2.5 kg shown as 5.51 lb), and comes back exactly (buildInExUnit).
//
// Into the exercise's unit a weight takes the plate rounding (convertWeight): a 60 kg logged
// before the switch reads 132.5 lb. Back into the profile's unit it is kept exact to 1/10000
// (exactWeight), so 55 lb is stored as 24.9476 kg and still reads 55 lb — it never drifts. An
// increment is a step, not a load, and goes to the other unit's nearest step (convertIncrement).
import { LB_PER_KG, convertWeight, convEntry, convTarget, convSet, convBarWeights } from './units.js'
import { defaultIncrement } from './progression.js'

export const EX_UNITS = ['kg', 'lb']
export const profileUnit = S => (S?.unit === 'lb' ? 'lb' : 'kg')

/** The unit an exercise's weights are shown and typed in. */
export function exUnitOf(S, id) {
  const own = id != null ? S?.exUnit?.[id] : null
  return own === 'kg' || own === 'lb' ? own : profileUnit(S)
}
/** Whether an exercise has a unit other than the profile's. */
export const hasOwnUnit = (S, id) => exUnitOf(S, id) !== profileUnit(S)

/** A conversion with no plate rounding, kept to 1/10000: what is stored for a weight typed in another unit. */
export function exactWeight(v, from, to) {
  if (from === to || v == null || v === '' || !Number.isFinite(Number(v))) return v
  const x = to === 'lb' ? Number(v) * LB_PER_KG : Number(v) / LB_PER_KG
  return Math.round(x * 1e4) / 1e4
}
// The steps a gym loads in each unit. An increment converted lands on the nearest of them when
// it is close (2.5 kg is a 5 lb step, not 5.5; 5 lb is a 2.5 kg one), so a step survives the
// trip there and back; one far from all of them (a 7 kg machine pin) converts as a weight.
const STEPS = { kg: [0.25, 0.5, 1, 1.25, 2, 2.5, 5, 10, 20], lb: [0.5, 1, 1.25, 2.5, 5, 10, 15, 20, 25, 45] }
export function convertIncrement(v, from, to) {
  if (from === to || !(Number(v) > 0)) return v
  const x = exactWeight(v, from, to)
  let best = null
  for (const step of STEPS[to] || []) {
    const off = Math.abs(Math.log(x / step))
    if (off < Math.log(1.2) && (best == null || off < best.off)) best = { step, off }
  }
  return best ? best.step : convertWeight(v, from, to)
}
const withInc = (out, cfg, from, to) => (out && cfg?.inc > 0 && (cfg.mode == null || cfg.mode === 'reps') ? { ...out, inc: convertIncrement(cfg.inc, from, to) } : out)
// A config in another unit: its loads by `conv`, its increment onto that unit's steps.
const convCfg = (cfg, from, to, conv = convertWeight) => withInc(convTarget(cfg, from, to, conv), cfg, from, to)
const convBuilt = (e, from, to, conv) => {
  const out = convEntry(e, from, to, conv)
  if (e?.target) out.target = convCfg(e.target, from, to, conv)
  if (e?.planned) out.planned = convCfg(e.planned, from, to, conv)
  return out
}

// What a stored weight reads as in the other unit: exact, to the hundredth the display can show.
const shownWeight = (v, from, to) => {
  const x = exactWeight(v, from, to)
  return typeof x === 'number' ? Math.round(x * 100) / 100 : x
}

/**
 * How one exercise's weights are shown and kept. `show` turns a stored (profile unit) weight
 * into the one on screen, `keep` a typed or stepped one back, `set` a whole set for a label.
 * The same shape as the speed column's view/store (views/Workout.jsx).
 */
export function weightView(S, id) {
  const from = profileUnit(S), unit = exUnitOf(S, id)
  if (unit === from) return { unit, own: false, show: v => v, keep: v => v, set: s => s, keepSet: s => s }
  return {
    unit,
    own: true,
    show: v => shownWeight(v, from, unit),
    keep: v => exactWeight(v, unit, from),
    set: s => convSet(s, from, unit, shownWeight),
    keepSet: s => convSet(s, unit, from, exactWeight),
  }
}

/**
 * What the plate math reads for one exercise (lib/plates.js), in its own unit: that unit's plate
 * inventory and the exercise's bar in it. The bar keeps being stored in the profile's unit.
 */
export function plateStateFor(S, id) {
  const from = profileUnit(S), to = exUnitOf(S, id)
  if (from === to) return S
  const bar = S.barWeights?.[id]
  return { ...S, unit: to, barWeights: bar == null ? {} : convBarWeights({ [id]: bar }, from, to) }
}

/** A config (a routine's target) as the exercise's settings sheet shows it, and back. */
export const targetToExUnit = (S, cfg) => (hasOwnUnit(S, cfg?.id) ? convCfg(cfg, profileUnit(S), exUnitOf(S, cfg.id), shownWeight) : cfg)
export const targetFromExUnit = (S, cfg, unit = exUnitOf(S, cfg?.id)) => (unit !== profileUnit(S) ? convCfg(cfg, unit, profileUnit(S), exactWeight) : cfg)
/** A draft config moved from one display unit to another (the unit picked in the settings sheet). */
export const retargetUnit = (cfg, from, to) => (from === to ? cfg : convCfg(cfg, from, to, shownWeight))

/** The load step of an exercise, in its own unit: the config's own, else that unit's default. */
export function exIncrement(S, cfg) {
  const unit = exUnitOf(S, cfg?.id)
  return cfg?.inc > 0 ? convertIncrement(cfg.inc, profileUnit(S), unit) : defaultIncrement(cfg?.id, unit)
}

/**
 * The state as one exercise sees it in its own unit: its sessions, kept weight, bar and
 * routine configs converted (plate rounding), `unit` set to it. Other exercises are left out of
 * the sessions, so nothing reads their weights under the wrong unit.
 */
export function stateInExUnit(S, id) {
  const from = profileUnit(S), to = exUnitOf(S, id)
  if (from === to) return S
  const kept = S.exWeights?.[id]
  const bar = S.barWeights?.[id]
  return {
    ...S,
    unit: to,
    workouts: (S.workouts || []).map(w => ({ ...w, entries: (w.entries || []).filter(e => e && e.id === id).map(e => convBuilt(e, from, to)) })),
    exWeights: kept == null ? {} : { [id]: kept && typeof kept === 'object' ? { ...kept, w: convertWeight(kept.w, from, to) } : convertWeight(kept, from, to) },
    barWeights: bar == null ? {} : convBarWeights({ [id]: bar }, from, to),
    routines: (S.routines || []).map(r => ({ ...r, ex: (r.ex || []).map(c => (c && c.id === id ? convCfg(c, from, to) : c)) })),
  }
}

/**
 * Builds an entry for `cfg` (a profile-unit config) the way `build(state, cfg)` does, in the
 * exercise's own unit, and returns it in the profile's: target, planned, sets and the
 * prescription's weight. An exercise in the profile's unit is built as it always was.
 */
export function buildInExUnit(S, cfg, build) {
  const from = profileUnit(S), to = exUnitOf(S, cfg?.id)
  if (from === to) return build(S, cfg)
  const built = build(stateInExUnit(S, cfg.id), convCfg(cfg, from, to))
  if (!built || typeof built !== 'object') return built
  const out = convBuilt(built, to, from, exactWeight)
  if (built.plan && built.plan.weight != null) out.plan = { ...built.plan, weight: exactWeight(built.plan.weight, to, from) }
  return out
}

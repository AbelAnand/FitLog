import type { Exercise, ExerciseKind, SetPatch, WorkoutDetail, WorkoutExerciseDetail, WorkoutSummary } from '../api/types'
import { defaultMetricsFor, type MetricKey } from '../data/cardio-metrics'
import type { SetRow } from '../lib/prs'
import { cleanExercise, cleanProfile, cleanSet, cleanWorkout, cleanWorkoutExercise } from './clean'
import { DEFAULT_PROFILE, type BackupFile, type Op, type Persistence, type StoredExercise, type StoredProfile, type StoredSet, type StoredWorkout, type StoredWorkoutExercise } from './types'

/**
 * The whole log, held in memory and mirrored to storage on the device.
 *
 * Reads are answered from memory. A write changes memory at once and is then saved; saves are sent
 * one after another so storage sees changes in the order they were made. If a save fails, memory is
 * reloaded from storage so the screen never shows something that was not kept.
 */

export class NotFound extends Error {}

const byPosition = (a: StoredWorkoutExercise, b: StoredWorkoutExercise) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
const bySetNumber = (a: StoredSet, b: StoredSet) => a.set_number - b.set_number || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

export interface ImportSummary {
  workouts: number
  exercises: number
  sets: number
  /** Records in the file that were already on this device (they are replaced by the file's version). */
  alreadyHere: number
  /**
   * Workouts that are on this device under another id with exactly the same sets, as happens when
   * a spreadsheet was restored first. A backup replaces them with its fuller copy; a spreadsheet
   * leaves them alone. Either way nothing is doubled.
   */
  sameWorkouts: number
  /** Records that could not be read and were left out. */
  skipped: number
}

const round = (n: number | null) => (n == null ? '' : String(Math.round(n * 100) / 100))

/** Everything a spreadsheet row says about a set, so both kinds of file describe it the same way. */
function setSignature(exerciseName: string, s: StoredSet): string {
  const drops = s.drops.map((d) => `${round(d.weight)}x${d.reps}`).join('/')
  return [exerciseName, s.set_number, s.set_type, round(s.weight), s.unit, s.reps, s.duration_seconds ?? '', round(s.distance), s.distance_unit ?? '', round(s.incline), drops].join('|')
}

function workoutSignature(w: StoredWorkout, sets: string[]): string {
  // A workout with no sets is never "the same" as another: there is nothing to compare.
  if (!sets.length) return `empty:${w.id}`
  return [w.date, w.title.trim().toLowerCase(), w.is_plan ? 'plan' : '', ...[...sets].sort()].join('\n')
}

export class LocalDb {
  private workouts = new Map<string, StoredWorkout>()
  private exercises = new Map<string, StoredExercise>()
  private entries = new Map<string, StoredWorkoutExercise>()
  private sets = new Map<string, StoredSet>()
  private meta = new Map<string, unknown>()
  private opening: Promise<void> | null = null
  private saving: Promise<unknown> = Promise.resolve()
  private store: Persistence

  constructor(store: Persistence) {
    this.store = store
  }

  /** Load everything from storage. Safe to call more than once. */
  open(): Promise<void> {
    if (!this.opening) {
      this.opening = this.reload().catch((e) => {
        this.opening = null
        throw e
      })
    }
    return this.opening
  }

  private async reload(): Promise<void> {
    const records = await this.store.load()
    this.workouts.clear()
    this.exercises.clear()
    this.entries.clear()
    this.sets.clear()
    this.meta.clear()
    for (const r of records) this.put(r.t, r.id, r.v)
  }

  /** Apply one record to memory. Anything unreadable is ignored. */
  private put(t: Op['t'], id: string, v: unknown | null): void {
    if (t === 'meta') {
      if (v == null) this.meta.delete(id)
      else this.meta.set(id, v)
      return
    }
    const map = t === 'workouts' ? this.workouts : t === 'exercises' ? this.exercises : t === 'workout_exercises' ? this.entries : this.sets
    if (v == null) {
      map.delete(id)
      return
    }
    const clean = t === 'workouts' ? cleanWorkout(v) : t === 'exercises' ? cleanExercise(v) : t === 'workout_exercises' ? cleanWorkoutExercise(v) : cleanSet(v)
    if (clean && clean.id === id) (map as Map<string, typeof clean>).set(id, clean)
  }

  /** Change memory now, save in the background. Resolves once the change is on disk. */
  private commit(ops: Op[]): Promise<void> {
    if (!ops.length) return Promise.resolve()
    for (const op of ops) this.put(op.t, op.id, op.v)
    // Save what memory now holds, so storage only ever contains cleaned records.
    const saved: Op[] = ops.map((op) => ({ t: op.t, id: op.id, v: op.v == null ? null : this.read(op.t, op.id) ?? null }))
    const mine = this.saving
      .catch(() => {})
      .then(() => this.store.write(saved))
      .catch(async (err) => {
        await this.reload().catch(() => {})
        throw err
      })
    this.saving = mine
    return mine
  }

  private read(t: Op['t'], id: string): unknown {
    return t === 'meta' ? this.meta.get(id) : t === 'workouts' ? this.workouts.get(id) : t === 'exercises' ? this.exercises.get(id) : t === 'workout_exercises' ? this.entries.get(id) : this.sets.get(id)
  }

  /** Resolves when every change made so far has been saved. */
  async flushed(): Promise<void> {
    await this.saving.catch(() => {})
  }

  /* ---------- Reading ---------- */

  profile(): StoredProfile {
    return cleanProfile(this.meta.get('profile') ?? DEFAULT_PROFILE)
  }

  lastBackupAt(): string | null {
    const v = this.meta.get('lastBackupAt')
    return typeof v === 'string' ? v : null
  }

  backupSnoozedUntil(): string | null {
    const v = this.meta.get('backupSnoozedUntil')
    return typeof v === 'string' ? v : null
  }

  counts(): { workouts: number; exercises: number; sets: number } {
    return { workouts: this.workouts.size, exercises: this.exercises.size, sets: this.sets.size }
  }

  private entriesOf(workoutId: string): StoredWorkoutExercise[] {
    const out: StoredWorkoutExercise[] = []
    for (const e of this.entries.values()) if (e.workout_id === workoutId) out.push(e)
    return out.sort(byPosition)
  }

  private setsByEntry(): Map<string, StoredSet[]> {
    const map = new Map<string, StoredSet[]>()
    for (const s of this.sets.values()) {
      const list = map.get(s.workout_exercise_id)
      if (list) list.push(s)
      else map.set(s.workout_exercise_id, [s])
    }
    return map
  }

  private metricsOf(e: StoredExercise | undefined): MetricKey[] {
    if (!e || e.kind !== 'cardio') return []
    return e.metrics?.length ? e.metrics : defaultMetricsFor(e.name)
  }

  listWorkouts(): WorkoutSummary[] {
    const sets = this.setsByEntry()
    const entries = new Map<string, StoredWorkoutExercise[]>()
    for (const e of this.entries.values()) {
      const list = entries.get(e.workout_id)
      if (list) list.push(e)
      else entries.set(e.workout_id, [e])
    }
    return [...this.workouts.values()]
      .map((w) => {
        const wes = (entries.get(w.id) ?? []).sort(byPosition)
        const planned = wes.filter((e) => e.planned)
        return {
          ...w,
          exerciseNames: wes.map((e) => this.exercises.get(e.exercise_id)?.name ?? '').filter(Boolean),
          setCount: wes.reduce((n, e) => n + (sets.get(e.id)?.length ?? 0), 0),
          plannedCount: planned.length,
          completedCount: planned.filter((e) => e.completed_at).length,
        }
      })
      .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)))
  }

  getWorkout(id: string): WorkoutDetail {
    const w = this.workouts.get(id)
    if (!w) throw new NotFound('Workout not found')
    const sets = this.setsByEntry()
    const exercises: WorkoutExerciseDetail[] = this.entriesOf(id).map((e) => {
      const ex = this.exercises.get(e.exercise_id)
      return {
        id: e.id,
        exercise_id: e.exercise_id,
        name: ex?.name ?? '',
        kind: ex?.kind ?? 'strength',
        track_incline: ex?.track_incline ?? false,
        metrics: this.metricsOf(ex),
        position: e.position,
        notes: e.notes,
        planned: e.planned,
        completed_at: e.completed_at,
        sets: (sets.get(e.id) ?? []).sort(bySetNumber).map(({ workout_exercise_id: _entry, ...s }) => s),
      }
    })
    return { ...w, exercises }
  }

  /** Every logged set with its workout and exercise. Plans are not history, so they are left out. */
  allSets(): SetRow[] {
    const out: SetRow[] = []
    for (const s of this.sets.values()) {
      const e = this.entries.get(s.workout_exercise_id)
      const w = e && this.workouts.get(e.workout_id)
      const ex = e && this.exercises.get(e.exercise_id)
      if (!e || !w || !ex || w.is_plan) continue
      out.push({ ...s, exercise_id: ex.id, exercise_name: ex.name, exercise_kind: ex.kind, workout_id: w.id, workout_title: w.title, date: w.date })
    }
    return out.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  }

  listExercises(): Exercise[] {
    const lastUsed = new Map<string, string>()
    for (const e of this.entries.values()) {
      const w = this.workouts.get(e.workout_id)
      if (!w || w.is_plan) continue
      if ((lastUsed.get(e.exercise_id) ?? '') < w.date) lastUsed.set(e.exercise_id, w.date)
    }
    return [...this.exercises.values()]
      .map((e) => ({ id: e.id, name: e.name, kind: e.kind, track_incline: e.track_incline, metrics: this.metricsOf(e), lastUsed: lastUsed.get(e.id) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  findExerciseByName(name: string): StoredExercise | undefined {
    const wanted = name.trim().toLowerCase()
    for (const e of this.exercises.values()) if (e.name.toLowerCase() === wanted) return e
    return undefined
  }

  /* ---------- Writing ---------- */

  setProfile(patch: Partial<StoredProfile>): Promise<void> {
    return this.commit([{ t: 'meta', id: 'profile', v: cleanProfile({ ...this.profile(), ...patch }) }])
  }

  markBackedUp(at: string): Promise<void> {
    return this.commit([{ t: 'meta', id: 'lastBackupAt', v: at }])
  }

  snoozeBackupReminder(until: string): Promise<void> {
    return this.commit([{ t: 'meta', id: 'backupSnoozedUntil', v: until }])
  }

  addWorkout(w: StoredWorkout): Promise<void> {
    return this.commit([{ t: 'workouts', id: w.id, v: w }])
  }

  patchWorkout(id: string, patch: Partial<Omit<StoredWorkout, 'id' | 'created_at'>>): Promise<void> {
    const w = this.workouts.get(id)
    if (!w) return Promise.reject(new NotFound('Workout not found'))
    return this.commit([{ t: 'workouts', id, v: { ...w, ...patch } }])
  }

  private removeEntryOps(entryId: string): Op[] {
    const ops: Op[] = [{ t: 'workout_exercises', id: entryId, v: null }]
    for (const s of this.sets.values()) if (s.workout_exercise_id === entryId) ops.push({ t: 'sets', id: s.id, v: null })
    return ops
  }

  private removeWorkoutOps(id: string): Op[] {
    const ops: Op[] = [{ t: 'workouts', id, v: null }]
    for (const e of this.entries.values()) if (e.workout_id === id) ops.push(...this.removeEntryOps(e.id))
    return ops
  }

  removeWorkout(id: string): Promise<void> {
    return this.commit(this.removeWorkoutOps(id))
  }

  /** Remove workouts that never got an exercise. `keepId` protects the one being edited. */
  removeEmptyWorkouts(keepId?: string, olderThanMs = 0): Promise<void> {
    const used = new Set([...this.entries.values()].map((e) => e.workout_id))
    const cutoff = Date.now() - olderThanMs
    const ops: Op[] = []
    for (const w of this.workouts.values()) {
      if (w.id !== keepId && !used.has(w.id) && new Date(w.created_at).getTime() < cutoff) ops.push({ t: 'workouts', id: w.id, v: null })
    }
    return this.commit(ops)
  }

  /** Add an exercise to a workout, creating the exercise if its name is new. Starts it with given sets. */
  addEntry(input: { entry: StoredWorkoutExercise; exercise: { name: string; kind: ExerciseKind; trackIncline: boolean }; sets: StoredSet[] }): Promise<void> {
    if (!this.workouts.has(input.entry.workout_id)) return Promise.reject(new NotFound('Workout not found'))
    const ops: Op[] = []
    let exercise = this.exercises.get(input.entry.exercise_id) ?? this.findExerciseByName(input.exercise.name)
    if (!exercise) {
      const name = input.exercise.name.trim()
      exercise = {
        id: input.entry.exercise_id,
        name,
        kind: input.exercise.kind,
        track_incline: input.exercise.kind === 'cardio' && input.exercise.trackIncline,
        metrics: input.exercise.kind === 'cardio' ? defaultMetricsFor(name) : null,
        created_at: input.entry.created_at,
      }
      ops.push({ t: 'exercises', id: exercise.id, v: exercise })
    }
    ops.push({ t: 'workout_exercises', id: input.entry.id, v: { ...input.entry, exercise_id: exercise.id } })
    for (const s of input.sets) ops.push({ t: 'sets', id: s.id, v: { ...s, workout_exercise_id: input.entry.id } })
    return this.commit(ops)
  }

  patchEntry(id: string, patch: { notes?: string; completed_at?: string | null }): Promise<void> {
    const e = this.entries.get(id)
    if (!e) return Promise.reject(new NotFound('Exercise not found'))
    return this.commit([{ t: 'workout_exercises', id, v: { ...e, ...patch } }])
  }

  removeEntry(id: string): Promise<void> {
    return this.commit(this.removeEntryOps(id))
  }

  /** Replace everything in a workout with copies of another workout's exercises and sets. */
  replaceEntries(workoutId: string, entries: { entry: StoredWorkoutExercise; sets: StoredSet[] }[]): Promise<void> {
    if (!this.workouts.has(workoutId)) return Promise.reject(new NotFound('Workout not found'))
    const ops: Op[] = []
    for (const e of this.entries.values()) if (e.workout_id === workoutId) ops.push(...this.removeEntryOps(e.id))
    for (const { entry, sets } of entries) {
      if (!this.exercises.has(entry.exercise_id)) continue
      ops.push({ t: 'workout_exercises', id: entry.id, v: { ...entry, workout_id: workoutId } })
      for (const s of sets) ops.push({ t: 'sets', id: s.id, v: { ...s, workout_exercise_id: entry.id } })
    }
    return this.commit(ops)
  }

  patchExercise(id: string, patch: { track_incline?: boolean; metrics?: MetricKey[] }): Promise<void> {
    const e = this.exercises.get(id)
    if (!e) return Promise.reject(new NotFound('Exercise not found'))
    return this.commit([{ t: 'exercises', id, v: { ...e, ...patch } }])
  }

  /** Delete an exercise from the library, along with every logged use of it. */
  removeExercise(id: string): Promise<void> {
    const ops: Op[] = [{ t: 'exercises', id, v: null }]
    for (const e of this.entries.values()) if (e.exercise_id === id) ops.push(...this.removeEntryOps(e.id))
    return this.commit(ops)
  }

  addSets(entryId: string, sets: StoredSet[]): Promise<void> {
    if (!this.entries.has(entryId)) return Promise.reject(new NotFound('Exercise not found'))
    return this.commit(sets.map((s) => ({ t: 'sets' as const, id: s.id, v: { ...s, workout_exercise_id: entryId } })))
  }

  patchSets(updates: { setId: string; patch: SetPatch }[]): Promise<void> {
    const ops: Op[] = []
    for (const { setId, patch } of updates) {
      const s = this.sets.get(setId)
      if (s) ops.push({ t: 'sets', id: setId, v: { ...s, ...patch } })
    }
    return this.commit(ops)
  }

  removeSet(id: string): Promise<void> {
    return this.commit([{ t: 'sets', id, v: null }])
  }

  replaceSets(entryId: string, sets: StoredSet[]): Promise<void> {
    if (!this.entries.has(entryId)) return Promise.reject(new NotFound('Exercise not found'))
    const keep = new Set(sets.map((s) => s.id))
    const ops: Op[] = []
    for (const s of this.sets.values()) if (s.workout_exercise_id === entryId && !keep.has(s.id)) ops.push({ t: 'sets', id: s.id, v: null })
    sets.forEach((s, i) => ops.push({ t: 'sets', id: s.id, v: { ...s, workout_exercise_id: entryId, set_number: i + 1 } }))
    return this.commit(ops)
  }

  /* ---------- Backup, restore, erase ---------- */

  exportAll(now = new Date()): BackupFile {
    const byCreated = <T extends { created_at: string; id: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
    return {
      app: 'FitLog',
      format: 1,
      exportedAt: now.toISOString(),
      profile: this.profile(),
      exercises: [...this.exercises.values()].sort(byCreated),
      workouts: [...this.workouts.values()].sort(byCreated),
      workout_exercises: [...this.entries.values()].sort(byCreated),
      sets: [...this.sets.values()].sort(byCreated),
    }
  }

  /**
   * What restoring this file would do, without doing it. Records that point at something missing
   * (a set whose exercise entry is not in the file or on the device) are counted as skipped.
   *
   * `kind` says how much the file knows: a backup holds everything, a spreadsheet holds sets only.
   */
  planImport(file: BackupFile, kind: 'backup' | 'spreadsheet' = 'backup'): { ops: Op[]; summary: ImportSummary } {
    const ops: Op[] = []
    let skipped = 0
    let alreadyHere = 0

    // An exercise with a name that already exists here is the same exercise, whatever its id.
    const exerciseId = new Map<string, string>()
    const exerciseName = new Map<string, string>()
    const namesHere = new Map([...this.exercises.values()].map((e) => [e.name.toLowerCase(), e.id]))
    let exercises = 0
    for (const raw of file.exercises) {
      const e = cleanExercise(raw)
      if (!e) { skipped++; continue }
      exerciseName.set(e.id, e.name.toLowerCase())
      const sameName = namesHere.get(e.name.toLowerCase())
      if (sameName && sameName !== e.id) {
        exerciseId.set(e.id, sameName)
        alreadyHere++
        // It keeps the id it has here. A backup knows how the exercise was set up; a spreadsheet only guesses.
        const mine = this.exercises.get(sameName)
        if (kind === 'backup' && mine) ops.push({ t: 'exercises', id: mine.id, v: { ...mine, name: e.name, kind: e.kind, track_incline: e.track_incline, metrics: e.metrics } })
        continue
      }
      if (this.exercises.has(e.id)) alreadyHere++
      namesHere.set(e.name.toLowerCase(), e.id)
      exerciseId.set(e.id, e.id)
      ops.push({ t: 'exercises', id: e.id, v: e })
      exercises++
    }
    const knownExercise = (id: string) => exerciseId.get(id) ?? (this.exercises.has(id) ? id : undefined)

    const workouts = file.workouts.map(cleanWorkout)
    const entries = file.workout_exercises.map(cleanWorkoutExercise)
    const sets = file.sets.map(cleanSet)

    // The same workout under another id: same day, same title, same sets.
    const incoming = new Map<string, string>()
    {
      const entryOf = new Map<string, StoredWorkoutExercise>()
      for (const e of entries) if (e) entryOf.set(e.id, e)
      const lines = new Map<string, string[]>()
      for (const s of sets) {
        const e = s && entryOf.get(s.workout_exercise_id)
        if (!s || !e) continue
        const name = exerciseName.get(e.exercise_id) ?? this.exercises.get(e.exercise_id)?.name.toLowerCase() ?? ''
        const list = lines.get(e.workout_id)
        if (list) list.push(setSignature(name, s))
        else lines.set(e.workout_id, [setSignature(name, s)])
      }
      for (const w of workouts) if (w) incoming.set(w.id, workoutSignature(w, lines.get(w.id) ?? []))
    }
    const here = new Map<string, string[]>()
    for (const [id, signature] of this.signatures()) {
      const list = here.get(signature)
      if (list) list.push(id)
      else here.set(signature, [id])
    }

    const workoutIds = new Set<string>()
    const leftOut = new Set<string>()
    let sameWorkouts = 0
    for (const w of workouts) {
      if (!w) { skipped++; continue }
      if (this.workouts.has(w.id)) alreadyHere++
      else {
        const twin = here.get(incoming.get(w.id) ?? '')?.shift()
        if (twin) {
          sameWorkouts++
          if (kind === 'spreadsheet') {
            // What is here knows at least as much as the spreadsheet does.
            leftOut.add(w.id)
            continue
          }
          ops.push(...this.removeWorkoutOps(twin))
        }
      }
      workoutIds.add(w.id)
      ops.push({ t: 'workouts', id: w.id, v: w })
    }

    const entryIds = new Set<string>()
    const leftOutEntries = new Set<string>()
    for (const e of entries) {
      if (e && leftOut.has(e.workout_id)) { leftOutEntries.add(e.id); continue }
      const mapped = e && knownExercise(e.exercise_id)
      if (!e || !mapped || !(workoutIds.has(e.workout_id) || this.workouts.has(e.workout_id))) { skipped++; continue }
      if (this.entries.has(e.id)) alreadyHere++
      entryIds.add(e.id)
      ops.push({ t: 'workout_exercises', id: e.id, v: { ...e, exercise_id: mapped } })
    }

    let setCount = 0
    for (const s of sets) {
      if (s && leftOutEntries.has(s.workout_exercise_id)) continue
      if (!s || !(entryIds.has(s.workout_exercise_id) || this.entries.has(s.workout_exercise_id))) { skipped++; continue }
      if (this.sets.has(s.id)) alreadyHere++
      ops.push({ t: 'sets', id: s.id, v: s })
      setCount++
    }

    return { ops, summary: { workouts: workoutIds.size, exercises, sets: setCount, alreadyHere, sameWorkouts, skipped } }
  }

  /** A fingerprint of every workout here that has sets, for recognising the same workout under another id. */
  private signatures(): Map<string, string> {
    const lines = new Map<string, string[]>()
    for (const s of this.sets.values()) {
      const e = this.entries.get(s.workout_exercise_id)
      if (!e) continue
      const name = this.exercises.get(e.exercise_id)?.name.toLowerCase() ?? ''
      const list = lines.get(e.workout_id)
      if (list) list.push(setSignature(name, s))
      else lines.set(e.workout_id, [setSignature(name, s)])
    }
    const out = new Map<string, string>()
    for (const [id, list] of lines) {
      const w = this.workouts.get(id)
      if (w) out.set(id, workoutSignature(w, list))
    }
    return out
  }

  /** Add a backup's contents to what is here. Nothing on the device is removed. */
  async importAll(file: BackupFile, options: { takeProfile?: boolean; kind?: 'backup' | 'spreadsheet' } = {}): Promise<ImportSummary> {
    const { ops, summary } = this.planImport(file, options.kind ?? 'backup')
    if (options.takeProfile) ops.push({ t: 'meta', id: 'profile', v: cleanProfile(file.profile) })
    await this.commit(ops)
    return summary
  }

  async eraseEverything(): Promise<void> {
    await this.flushed()
    await this.store.wipe()
    await this.reload()
  }
}

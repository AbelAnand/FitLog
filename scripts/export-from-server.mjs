#!/usr/bin/env node
// Download everything one account logged in the old, online version of FitLog and write it as a
// backup file that the app can restore (Settings → Restore from a file).
//
//   npm run export:server
//
// You are asked for the email and password of the account. Nothing is changed on the server.
// The file is written to ~/Documents/FitLog Backups/.

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

function env(name) {
  if (process.env[name]) return process.env[name]
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`))
    return line?.slice(name.length + 1).trim()
  } catch {
    return undefined
  }
}

// One reader for both questions, so answers can also be piped in.
const reader = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true })
const waiting = []
const answers = []
reader.on('line', (line) => (waiting.length ? waiting.shift()(line) : answers.push(line)))
reader.on('close', () => waiting.splice(0).forEach((resolve) => resolve('')))
let hidden = false
const write = reader._writeToOutput?.bind(reader)
// While the password is typed, print nothing but the line break at the end.
if (write) reader._writeToOutput = (text) => (hidden ? (text.includes('\n') || text.includes('\r') ? process.stdout.write('\n') : true) : write(text))

function ask(question, options = {}) {
  process.stdout.write(question)
  hidden = options.hidden === true
  return new Promise((resolve) => (answers.length ? resolve(answers.shift()) : waiting.push(resolve))).then((answer) => {
    hidden = false
    return String(answer).trim()
  })
}

const url = env('VITE_SUPABASE_URL')
const key = env('VITE_SUPABASE_ANON_KEY')
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. They are read from .env.local.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const email = await ask('Email: ')
const password = await ask('Password: ', { hidden: true })
const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
if (signInError) {
  console.error(`Could not sign in: ${signInError.message}`)
  reader.close()
  process.exit(1)
}

/** The API returns at most 1,000 rows per request. */
async function all(table, columns) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order('created_at').order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

try {
  const { data: profile } = await supabase.from('profiles').select('unit, distance_unit, weekly_goal').maybeSingle()
  const backup = {
    app: 'FitLog',
    format: 1,
    exportedAt: new Date().toISOString(),
    source: 'server copy',
    profile: profile ?? { unit: 'lb', distance_unit: 'mi', weekly_goal: 4 },
    exercises: await all('exercises', 'id, name, kind, track_incline, metrics, created_at'),
    workouts: await all('workouts', 'id, title, date, notes, created_at, started_at, finished_at, paused_at, paused_seconds, is_plan'),
    workout_exercises: await all('workout_exercises', 'id, workout_id, exercise_id, position, notes, planned, completed_at, created_at'),
    sets: await all('sets', 'id, workout_exercise_id, set_number, set_type, weight, unit, reps, duration_seconds, distance, distance_unit, drops, incline, extra, created_at'),
  }
  const dir = join(homedir(), 'Documents', 'FitLog Backups')
  mkdirSync(dir, { recursive: true })
  const stamp = backup.exportedAt.slice(0, 16).replace(/[:T]/g, '-')
  const file = join(dir, `fitlog-backup-${stamp}-server-copy.json`)
  writeFileSync(file, JSON.stringify(backup, null, 1))
  console.log(`\n${backup.workouts.length} workouts, ${backup.exercises.length} exercises, ${backup.sets.length} sets`)
  console.log(`Saved to ${file}`)
  console.log('Send it to your iPhone (AirDrop or iCloud Drive), then in FitLog: Settings → Restore from a file.')
} catch (e) {
  console.error(`The download failed: ${e.message}`)
  process.exitCode = 1
} finally {
  await supabase.auth.signOut().catch(() => {})
  reader.close()
}

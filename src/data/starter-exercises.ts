import type { ExerciseKind } from '../api/types'

export type MuscleGroup = 'chest' | 'shoulders' | 'triceps' | 'back' | 'biceps' | 'legs' | 'glutes' | 'core' | 'cardio' | 'other'

export interface StarterExercise {
  name: string
  group: MuscleGroup
  kind: ExerciseKind
  /** Cardio machines/activities where incline matters get an incline column by default. */
  trackIncline?: boolean
}

const s = (group: MuscleGroup, names: string[]): StarterExercise[] => names.map((name) => ({ name, group, kind: 'strength' }))

/** Built-in exercise names offered in the picker before the user has history. */
export const STARTER_EXERCISES: StarterExercise[] = [
  ...s('chest', ['Bench Press', 'Incline Bench Press', 'Decline Bench Press', 'Dumbbell Bench Press', 'Incline Dumbbell Press', 'Chest Fly', 'Cable Fly', 'Pec Deck', 'Push-Up', 'Dip', 'Machine Chest Press']),
  ...s('shoulders', ['Overhead Press', 'Dumbbell Shoulder Press', 'Arnold Press', 'Lateral Raise', 'Cable Lateral Raise', 'Front Raise', 'Rear Delt Fly', 'Face Pull', 'Upright Row', 'Shrug']),
  ...s('triceps', ['Tricep Pushdown', 'Overhead Tricep Extension', 'Skull Crusher', 'Close-Grip Bench Press', 'Tricep Kickback', 'Tricep Dip']),
  ...s('back', ['Deadlift', 'Barbell Row', 'Dumbbell Row', 'Pendlay Row', 'T-Bar Row', 'Seated Cable Row', 'Lat Pulldown', 'Pull-Up', 'Chin-Up', 'Straight-Arm Pulldown', 'Chest-Supported Row', 'Machine Row', 'Rack Pull']),
  ...s('biceps', ['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl', 'Preacher Curl', 'Incline Dumbbell Curl', 'Cable Curl', 'Concentration Curl', 'EZ-Bar Curl']),
  ...s('legs', ['Squat', 'Front Squat', 'Goblet Squat', 'Hack Squat', 'Leg Press', 'Bulgarian Split Squat', 'Lunge', 'Walking Lunge', 'Leg Extension', 'Leg Curl', 'Seated Leg Curl', 'Romanian Deadlift', 'Sumo Deadlift', 'Good Morning', 'Calf Raise', 'Seated Calf Raise', 'Step-Up']),
  ...s('glutes', ['Hip Thrust', 'Glute Bridge', 'Cable Kickback', 'Hip Abduction', 'Hip Adduction']),
  ...s('core', ['Plank', 'Hanging Leg Raise', 'Cable Crunch', 'Ab Wheel Rollout', 'Russian Twist', 'Sit-Up', 'Dead Bug', 'Side Plank']),
  ...s('other', ["Farmer's Carry", 'Kettlebell Swing', 'Clean and Press', 'Power Clean', 'Sled Push']),
  ...[
    { name: 'Treadmill', trackIncline: true },
    { name: 'Running' },
    { name: 'Walking', trackIncline: true },
    { name: 'Hiking', trackIncline: true },
    { name: 'Stair Climber', trackIncline: true },
    { name: 'Elliptical', trackIncline: true },
    { name: 'Cycling' },
    { name: 'Stationary Bike' },
    { name: 'Rowing' },
    { name: 'Swimming' },
    { name: 'Jump Rope' },
    { name: 'HIIT' },
  ].map((c) => ({ ...c, group: 'cardio' as const, kind: 'cardio' as const })),
]

export const GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  triceps: 'Triceps',
  back: 'Back',
  biceps: 'Biceps',
  legs: 'Legs',
  glutes: 'Glutes',
  core: 'Core',
  cardio: 'Cardio',
  other: 'Other',
}

/** Which muscle groups a workout title implies, e.g. "Push" → chest, shoulders, triceps. */
export function groupsForTitle(title: string): MuscleGroup[] {
  const t = title.toLowerCase()
  const has = (...words: string[]) => words.some((w) => t.includes(w))
  const groups: MuscleGroup[] = []
  const add = (...g: MuscleGroup[]) => g.forEach((x) => !groups.includes(x) && groups.push(x))
  if (has('push')) add('chest', 'shoulders', 'triceps')
  if (has('pull')) add('back', 'biceps')
  if (has('leg', 'lower', 'quad', 'hamstring', 'glute', 'booty')) add('legs', 'glutes', 'core')
  if (has('upper')) add('chest', 'back', 'shoulders', 'biceps', 'triceps')
  if (has('full')) add('legs', 'chest', 'back', 'shoulders', 'core')
  if (has('chest')) add('chest', 'triceps')
  if (has('back')) add('back', 'biceps')
  if (has('shoulder', 'delt')) add('shoulders')
  if (has('arm', 'bicep', 'tricep')) add('biceps', 'triceps')
  if (has('core', 'ab')) add('core')
  if (has('cardio', 'run', 'conditioning', 'bike', 'row', 'swim', 'hiit')) add('cardio')
  return groups
}

const STARTER_NAMES = new Set(STARTER_EXERCISES.map((s) => s.name.toLowerCase()))

/** Built-in exercises can't be deleted or renamed by the user. */
export function isStarterExercise(name: string): boolean {
  return STARTER_NAMES.has(name.trim().toLowerCase())
}

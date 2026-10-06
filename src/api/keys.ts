export const keys = {
  profile: ['profile'] as const,
  workouts: ['workouts'] as const,
  workout: (id: string) => ['workout', id] as const,
  sets: ['sets'] as const,
  exercises: ['exercises'] as const,
  backup: ['backup'] as const,
}

/** Every write to a workout carries this key, so "is anything still saving?" is one lookup. */
export const EDIT_KEY = 'workout-edit'
export const editKey = (workoutId: string) => [EDIT_KEY, workoutId] as const

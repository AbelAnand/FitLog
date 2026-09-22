export const keys = {
  profile: ['profile'] as const,
  workouts: ['workouts'] as const,
  workout: (id: string) => ['workout', id] as const,
  sets: ['sets'] as const,
  exercises: ['exercises'] as const,
}

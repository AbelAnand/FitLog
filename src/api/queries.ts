import { useQuery, useQueryClient } from '@tanstack/react-query'
import { db } from '../db'
import type { SetRow } from '../lib/prs'
import { editKey, keys } from './keys'
import type { Exercise, Profile, WorkoutDetail, WorkoutSummary } from './types'

/*
 * Everything is read from the database on the device (src/db). Reads are instant and never fail
 * for lack of signal, so there is no loading state to speak of after the app has opened.
 */

/** Local data only changes when the app changes it, and the app says so by invalidating. */
const local = { staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false, networkMode: 'always' } as const

export function useProfile() {
  return useQuery({
    queryKey: keys.profile,
    ...local,
    queryFn: async (): Promise<Profile> => {
      await db.open()
      return { id: 'me', ...db.profile() }
    },
  })
}

export function useWorkouts() {
  return useQuery({
    queryKey: keys.workouts,
    ...local,
    queryFn: async (): Promise<WorkoutSummary[]> => {
      await db.open()
      return db.listWorkouts()
    },
  })
}

export async function fetchWorkout(id: string): Promise<WorkoutDetail> {
  await db.open()
  return db.getWorkout(id)
}

export function useWorkout(id: string | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: keys.workout(id ?? ''),
    ...local,
    queryFn: () => fetchWorkout(id!),
    enabled: !!id,
    // While changes to this workout are still being saved, the copy on screen is the newest one.
    refetchOnMount: () => qc.isMutating({ mutationKey: editKey(id ?? '') }) === 0,
  })
}

/** Every set ever logged, flattened. Powers records, progress, suggestions, and export. */
export function useAllSets() {
  return useQuery({
    queryKey: keys.sets,
    ...local,
    queryFn: async (): Promise<SetRow[]> => {
      await db.open()
      return db.allSets()
    },
  })
}

export function useExercises() {
  return useQuery({
    queryKey: keys.exercises,
    ...local,
    queryFn: async (): Promise<Exercise[]> => {
      await db.open()
      return db.listExercises()
    },
  })
}

/** When the last backup file was saved, and how much there is to lose. */
export function useBackupStatus() {
  return useQuery({
    queryKey: keys.backup,
    ...local,
    queryFn: async () => {
      await db.open()
      return { lastBackupAt: db.lastBackupAt(), snoozedUntil: db.backupSnoozedUntil(), ...db.counts() }
    },
  })
}

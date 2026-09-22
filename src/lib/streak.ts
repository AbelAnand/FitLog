import { addDays, format, isSameDay, parseISO, startOfWeek, subWeeks } from 'date-fns'

export interface WeekDay {
  date: Date
  label: string
  trained: boolean
  isToday: boolean
  isFuture: boolean
}

export interface StreakInfo {
  /** Consecutive weeks (ending this or last week) where the goal was met. */
  streak: number
  thisWeekCount: number
  goal: number
  week: WeekDay[]
  /** Whether the current week already counts toward the streak. */
  thisWeekDone: boolean
}

function weekKey(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

/**
 * Weekly-goal streak. A week counts if the number of distinct training days
 * in that Monday–Sunday week is >= goal. The streak is the run of consecutive
 * qualifying weeks ending at the current week (if already met) or last week.
 */
export function computeStreak(workoutDates: string[], goal: number, today = new Date()): StreakInfo {
  const daysByWeek = new Map<string, Set<string>>()
  for (const iso of workoutDates) {
    const d = parseISO(iso)
    const key = weekKey(d)
    if (!daysByWeek.has(key)) daysByWeek.set(key, new Set())
    daysByWeek.get(key)!.add(iso)
  }

  const countFor = (d: Date) => daysByWeek.get(weekKey(d))?.size ?? 0

  const thisWeekCount = countFor(today)
  const thisWeekDone = thisWeekCount >= goal

  let streak = 0
  let cursor = thisWeekDone ? today : subWeeks(today, 1)
  while (countFor(cursor) >= goal) {
    streak += 1
    cursor = subWeeks(cursor, 1)
    if (streak > 520) break
  }

  const monday = startOfWeek(today, { weekStartsOn: 1 })
  const trainedSet = new Set(workoutDates)
  const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return {
      date,
      label: format(date, 'EEEEE'),
      trained: trainedSet.has(format(date, 'yyyy-MM-dd')),
      isToday: isSameDay(date, today),
      isFuture: date > today && !isSameDay(date, today),
    }
  })

  return { streak, thisWeekCount, goal, week, thisWeekDone }
}

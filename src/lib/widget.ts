import { registerPlugin } from '@capacitor/core'
import { isNative } from './native'

export interface WidgetData {
  streak: number
  thisWeek: number
  goal: number
  /** Mon..Sun: 1 trained, 0 not */
  week: number[]
  todayIndex: number
  lastTitle: string
  lastDate: string
  updatedAt: number
}

interface WidgetBridgePlugin {
  update(data: WidgetData): Promise<void>
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge')

/** Push the latest streak snapshot to the iOS home-screen widget. No-op on the web. */
export async function updateWidget(data: WidgetData): Promise<void> {
  if (!isNative) return
  try {
    await WidgetBridge.update(data)
  } catch {
    // Widget bridge unavailable (older build); ignore.
  }
}

// The two things every change leaves behind: a line on the item's trail,
// and who signed off and when. Shared by the store and the feature modules
// that plug into it.
import { activityId, CURRENT_USER } from "./data"
import { TODAY } from "./deadlines"
import type { Activity, Stamp } from "./types"

export function log(actor: Activity["actor"], title: string, detail?: string): Activity {
  return { id: activityId(), actor, title, detail, time: "Just now" }
}

export function stamp(): Stamp {
  return { at: TODAY, by: CURRENT_USER.name }
}

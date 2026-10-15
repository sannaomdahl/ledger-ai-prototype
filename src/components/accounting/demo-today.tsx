// The demo's today, always in view. Every date in the prototype is set
// around it, so without it a tester reads dates against the real calendar
// ("this card payment is in the future") and asks which month to close.
import { CalendarDaysIcon } from "lucide-react"

import { TODAY } from "@/lib/accounting/data"

const LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${TODAY}T12:00:00Z`))

export function DemoToday() {
  return (
    <span
      className="text-muted-foreground hidden items-center gap-1.5 text-xs whitespace-nowrap tabular-nums lg:inline-flex"
      title="The demo's today: every date in the prototype is set around it."
    >
      <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
      Today in the demo · {LABEL.replace(",", "")}
    </span>
  )
}

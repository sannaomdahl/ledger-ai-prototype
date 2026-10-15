"use client"

// What onboarding left for after the hand-over, on the client's own page:
// tasks marked "Finish after hand-over", optional ones and ones added by
// hand that nobody settled. Questions that were still with the company went
// into their app as tasks at the hand-over; these are the ones still ours.
// Each row works as it did on the checklist.
import { useState } from "react"
import Link from "next/link"
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame"
import { ArrowRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { carriedOver, formatDay } from "@/lib/accounting/onboarding"
import { useAccounting } from "@/lib/accounting/store"
import { TaskRow } from "./checklist-panel"

export function FromOnboarding({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const [openId, setOpenId] = useState<string | null>(null)
  const c = state.onboarding.find((x) => x.id === clientId && x.handedOver)
  if (!c) return null
  const tasks = carriedOver(c)
  if (!tasks.length) return null

  return (
    <Frame dense spacing="sm" className="w-full">
      <FrameHeader className="flex-row items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-px">
          <FrameTitle>Left from onboarding</FrameTitle>
          <FrameDescription className="text-xs">
            {tasks.length} still open from the hand-over {formatDay(c.handedOver!.at)}
          </FrameDescription>
        </div>
        <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/onboarding/${c.id}`} />}>
          Onboarding
          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
      </FrameHeader>
      <FramePanel className="p-0">
        <ul className="divide-y">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskRow
                c={c}
                task={task}
                open={openId === task.id}
                onOpenChange={(open) => setOpenId(open ? task.id : null)}
                readOnly={false}
                removable={false}
              />
            </li>
          ))}
        </ul>
      </FramePanel>
    </Frame>
  )
}

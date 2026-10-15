"use client"

// Beside "Ready to book" in Tasks & requests: per client, the approval list
// the agent has drafted for this week. A list where nothing stands out goes
// in one click with the agent's message; one with something to look at
// opens on the client's Bookkeeping, composer and all.
import { useMemo, type ComponentType, type ReactNode } from "react"
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame"
import Link from "next/link"
import { ArrowRightIcon, CircleAlertIcon, ListChecksIcon, SendIcon, ThumbsUpIcon } from "lucide-react"

import { formatNok } from "@/components/accounting/meta"
import { Button } from "@/components/ui/button"
import { draftList, type DraftList } from "@/lib/accounting/approvals"
import { CLIENT_BY_ID, OPEN_MONTH } from "@/lib/accounting/data"
import { useAccounting } from "@/lib/accounting/store"
import { useSendList } from "./prepare-list"

export function ReadyToSend({
  clientIds,
  showClient,
  Scroll,
}: {
  clientIds: string[]
  showClient: boolean
  /** The board's horizontal scroll area, so both strips scroll alike. */
  Scroll: ComponentType<{ children: ReactNode }>
}) {
  const { state, dispatch } = useAccounting()
  const send = useSendList()
  const key = clientIds.join(",")
  const drafts = useMemo(
    () =>
      clientIds
        .map((clientId) => ({ clientId, draft: draftList(state, clientId) }))
        .filter((d): d is { clientId: string; draft: DraftList } => d.draft !== null)
        // The quiet ones first: they go in one click.
        .sort(
          (a, b) =>
            a.draft.rows.filter((r) => r.needsLook).length - b.draft.rows.filter((r) => r.needsLook).length ||
            b.draft.rows.length - a.draft.rows.length
        ),
    // The drafts only depend on these slices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.items, state.requests, state.approvals, state.onboarding, key]
  )
  if (!drafts.length) return null
  const total = drafts.reduce((sum, d) => sum + d.draft.rows.length, 0)

  return (
    <Frame spacing="sm" className="w-full">
      <FrameHeader className="flex min-h-9 flex-row flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5">
        <ListChecksIcon className="text-info-text size-4 shrink-0" aria-hidden="true" />
        <FrameTitle className="text-sm leading-5">Ready to send</FrameTitle>
        <span className="text-muted-foreground text-xs font-medium tabular-nums">{drafts.length}</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px] leading-4 max-sm:basis-full">
          This week&apos;s approval lists · {total} booked {total === 1 ? "invoice" : "invoices"} for customers to approve before they&apos;re paid
        </span>
      </FrameHeader>
      <Scroll>
        <ul className="flex w-full gap-2 p-0.5">
          {drafts.map(({ clientId, draft }) => {
            const client = CLIENT_BY_ID.get(clientId)
            const n = draft.rows.length
            const look = draft.rows.filter((r) => r.needsLook).length
            const sum = draft.rows.reduce((s, r) => s + Math.abs(r.item.amount), 0)
            const first = draft.recipient.name.split(" ")[0]
            const lookFirst = (
              <Button
                type="button"
                size="xs"
                variant={look ? "outline" : "ghost"}
                nativeButton={false}
                // The track shows "now": make the month the open one.
                render={
                  <Link
                    href={`/clients/${clientId}/bookkeeping?prepare=1`}
                    onClick={() => dispatch({ type: "set_month", month: OPEN_MONTH })}
                  />
                }
              >
                Look first
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </Button>
            )
            return (
              <li key={clientId} className="min-w-[15rem] flex-1 basis-0">
                <FramePanel className="flex h-full min-w-0 flex-col gap-2.5 p-3">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-foreground truncate text-sm leading-5 font-semibold">
                        {showClient ? client?.name : "This week's list"}
                      </span>
                      <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs [&_svg]:size-3">
                        {look ? (
                          <CircleAlertIcon className="text-warning-text" aria-hidden="true" />
                        ) : (
                          <ThumbsUpIcon aria-hidden="true" />
                        )}
                        <span className="truncate">
                          {n} {n === 1 ? "invoice" : "invoices"} for {first} ·{" "}
                          {look ? (
                            <span className="text-warning-text">
                              {look} {look === 1 ? "needs" : "need"} a look
                            </span>
                          ) : (
                            "nothing stands out"
                          )}
                        </span>
                      </span>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{formatNok(sum)}</span>
                  </div>
                  <div className="mt-auto flex items-center gap-1.5">
                    {look ? (
                      lookFirst
                    ) : (
                      <>
                        <Button type="button" size="xs" onClick={() => send(clientId, draft)}>
                          <SendIcon data-icon="inline-start" aria-hidden="true" />
                          Send to {first}
                        </Button>
                        {lookFirst}
                      </>
                    )}
                  </div>
                </FramePanel>
              </li>
            )
          })}
        </ul>
      </Scroll>
    </Frame>
  )
}

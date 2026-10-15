"use client"

// Why the agent suggests what it does: every fact it used, where the fact came
// from, and which way it pulls. Then the same counterparty in earlier months,
// which is the strongest signal an accountant has. On a supplier invoice,
// what will make the customer look twice before approving it (a new
// supplier, an amount far from the usual, a price other clients don't pay)
// comes first, marked as the anomaly it is. Pay lines' anomalies too. Built from ReUI IconTile + Badge and shadcn Item, in the row
// grammar of @reui/agent-activity-5.
import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
import { cn } from "cn"
import {
  BookOpenCheckIcon,
  FileSignatureIcon,
  FileTextIcon,
  HistoryIcon,
  LandmarkIcon,
  MessageSquareTextIcon,
  ScaleIcon,
  StoreIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { openAnomalies } from "@/lib/accounting/anomalies"
import { AnomalyIcon } from "./anomaly"
import { monthName, signalsFor, similarBookings } from "@/lib/accounting/data"
import { useAccounting } from "@/lib/accounting/store"
import type { AnomalyKind, ReviewItem, Signal } from "@/lib/accounting/types"
import { formatNok } from "./meta"

const SOURCE: Record<Signal["source"], { label: string; icon: React.ReactNode }> = {
  history: { label: "This client's history", icon: <HistoryIcon aria-hidden="true" /> },
  document: { label: "Receipt or invoice", icon: <FileTextIcon aria-hidden="true" /> },
  rule: { label: "Accounting rule", icon: <ScaleIcon aria-hidden="true" /> },
  bank: { label: "Bank transaction", icon: <LandmarkIcon aria-hidden="true" /> },
  registry: { label: "Public registry", icon: <BookOpenCheckIcon aria-hidden="true" /> },
  customer: { label: "Customer's answer", icon: <MessageSquareTextIcon aria-hidden="true" /> },
}

/** Where an anomaly comes from. */
const CHECK: Record<AnomalyKind, { label: string; icon: React.ReactNode }> = {
  new_supplier: { label: "Approved suppliers", icon: <StoreIcon aria-hidden="true" /> },
  amount_jump: { label: "This client's history", icon: <HistoryIcon aria-hidden="true" /> },
  benchmark: { label: "Other clients, same supplier", icon: <UsersIcon aria-hidden="true" /> },
  large_amount: { label: "Approval routine", icon: <ScaleIcon aria-hidden="true" /> },
  bank_account: { label: "Earlier invoices' bank account", icon: <LandmarkIcon aria-hidden="true" /> },
  new_employee: { label: "Employee registry", icon: <UserPlusIcon aria-hidden="true" /> },
  pay_change: { label: "This person's earlier pay", icon: <HistoryIcon aria-hidden="true" /> },
  commission: { label: "This person's earlier pay", icon: <HistoryIcon aria-hidden="true" /> },
  correction: { label: "Pay correction", icon: <HistoryIcon aria-hidden="true" /> },
  leaving: { label: "Employee registry", icon: <UserPlusIcon aria-hidden="true" /> },
  off_agreement: { label: "Pay agreement", icon: <FileSignatureIcon aria-hidden="true" /> },
  extra_pay: { label: "Pay agreement", icon: <FileSignatureIcon aria-hidden="true" /> },
}

const EFFECT: Record<
  Signal["effect"] | "anomaly",
  { label: string; tone: string; badge: "success-light" | "warning-light" | "outline" }
> = {
  supports: { label: "Supports", tone: "text-success-text", badge: "success-light" },
  against: { label: "Needs a check", tone: "text-warning-text", badge: "warning-light" },
  neutral: { label: "Context", tone: "text-muted-foreground", badge: "outline" },
  anomaly: { label: "Anomaly", tone: "text-warning-text", badge: "warning-light" },
}

export function AgentReasoning({ item }: { item: ReviewItem }) {
  const { state, dispatch } = useAccounting()
  // What stands out for the approval reads as an anomaly.
  const checks = openAnomalies(state, item).map((a) => ({
    text: a.detail,
    effect: "anomaly" as const,
    ...CHECK[a.kind],
  }))
  const signals = [
    ...checks,
    ...signalsFor(item).map((signal) => ({ ...signal, ...SOURCE[signal.source] })),
  ]
  const past = similarBookings(item, state.items)
  const supports = signals.filter((s) => s.effect === "supports").length
  const against = signals.length - supports
  const pct = Math.round(item.suggestion.confidence * 100)
  // "Why 86 and not 100?": the reasoning that pulls against it, or the
  // agent's own one-line gap when none does.
  const missing = item.suggestion.gap
    ? [item.suggestion.gap]
    : signals.filter((s) => s.effect === "against").map((s) => s.text)

  return (
    <div className="flex flex-col gap-4">
      {item.status !== "booked" && pct < 100 ? (
        <div className="bg-muted/50 flex flex-col gap-1 rounded-lg px-3 py-2.5">
          <span className="text-foreground text-xs font-medium">
            {pct}% sure · {missing.length ? "what's missing for 100%" : pct < 80 ? "nothing to compare with" : "nothing missing"}
          </span>
          {missing.length ? (
            <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs text-pretty">
              {missing.slice(0, 3).map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground text-xs text-pretty">
              {pct < 80
                ? "Nothing argues against it, but nothing confirms it either: no earlier bookings like it to go by. Check the account against the document."
                : "Every fact supports the suggestion. It stays under 100% until a month like this has gone through without a change."}
            </span>
          )}
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {supports} {supports === 1 ? "fact supports" : "facts support"} the
        suggestion
        {against > 0
          ? `, ${against} ${against === 1 ? "needs" : "need"} a human look`
          : ""}
        .
      </p>

      <ItemGroup className="gap-1">
        {signals.map((signal) => {
          const effect = EFFECT[signal.effect]
          const source = signal
          return (
            <Item key={signal.text} size="xs" className="items-start px-0">
              <ItemMedia className="self-start">
                <IconTile variant="soft" size="xs" className={effect.tone}>
                  {source.icon}
                </IconTile>
              </ItemMedia>
              <ItemContent className="min-w-0 gap-0.5">
                <ItemTitle className="text-foreground text-sm leading-5 font-normal text-pretty">
                  {signal.text}
                </ItemTitle>
                <ItemDescription className="text-xs">{source.label}</ItemDescription>
              </ItemContent>
              <ItemActions className="self-start">
                <Badge variant={effect.badge} size="sm" className="gap-1 font-normal [&_svg]:size-3">
                  {signal.effect === "anomaly" ? <AnomalyIcon aria-hidden="true" /> : null}
                  {effect.label}
                </Badge>
              </ItemActions>
            </Item>
          )
        })}
      </ItemGroup>

      {past.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-muted-foreground text-xs font-medium">
            Booked the same way before
          </h4>
          <ItemGroup className="border-border/60 overflow-hidden rounded-lg border">
            {past.map((booking, index) => {
              const same =
                booking.suggestion.lines[0].account ===
                item.suggestion.lines[0].account
              return (
                <Item
                  key={booking.id}
                  size="xs"
                  render={
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "open_item",
                          id: booking.id,
                          nav: [item.id, ...past.map((p) => p.id)],
                        })
                      }
                    />
                  }
                  className={cn(
                    "hover:bg-muted/50 w-full rounded-none text-left transition-colors duration-150",
                    index > 0 && "border-t-border/60 border-t"
                  )}
                >
                  <ItemContent className="min-w-0 gap-0">
                    <ItemTitle className="text-foreground text-[13px] font-normal">
                      <span className="text-muted-foreground w-8 shrink-0">
                        {monthName(booking.period)}
                      </span>
                      <span className="truncate">
                        {booking.suggestion.lines[0].account}
                      </span>
                    </ItemTitle>
                  </ItemContent>
                  <ItemActions className="gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatNok(Math.abs(booking.amount))}
                    </span>
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        same ? "bg-success" : "bg-warning"
                      )}
                      aria-label={same ? "Same account" : "Different account"}
                    />
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No earlier bookings for {item.title} at this client.
        </p>
      )}
    </div>
  )
}

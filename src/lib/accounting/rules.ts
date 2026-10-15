// What the agents learned: standing instructions the accountant gave them
// ("always book this supplier like this"). A rule matches a client's
// counterparty by name; the agents use it for every new line from them.
import type { AgentRule, ReviewItem } from "./types"

function rule(clientId: string, match: string, account: string, vat: string, createdBy: string, createdAt: string): AgentRule {
  return { id: `rule-${clientId}-${match}`, clientId, match, account, vat, createdBy, createdAt }
}

/** Rules taught before the demo starts, so a client's Overview has
    something to show. Each matches a supplier the client really has. */
export function seedRules(): AgentRule[] {
  return [
    rule("fjord-kaffebar", "Tine SA", "4300 Goods for resale", "11 · Input 15%", "ingrid", "2026-03-11"),
    rule("fjord-kaffebar", "Hafslund Strøm AS", "6340 Electricity & heating", "1 · Input 25%", "ingrid", "2026-05-20"),
    rule("nordlys-design", "Adobe Systems Software", "6420 Software subscriptions", "86 · Reverse charge 25%", "ingrid", "2026-04-02"),
    rule("bergen-bygg", "Telenor Norge AS", "6900 Phone & internet", "1 · Input 25%", "marius", "2026-02-17"),
    rule("lysaker-it", "Amazon Web Services EMEA", "6420 Software subscriptions", "86 · Reverse charge 25%", "marius", "2026-06-09"),
    rule("tinde", "Meta Platforms Ireland", "7320 Advertising", "86 · Reverse charge 25%", "sofie", "2026-08-25"),
  ]
}

/** The rule a bookkeeping line falls under, if any. */
export function ruleFor(rules: AgentRule[], item: Pick<ReviewItem, "clientId" | "domain" | "title">) {
  if (item.domain !== "bookkeeping") return undefined
  return rules.find((r) => r.clientId === item.clientId && r.match === item.title)
}

/** Whether the line is booked the way its rule says. */
export function followsItsRule(rule: AgentRule, item: ReviewItem) {
  const line = item.suggestion.lines[0]
  return line.account === rule.account && (!rule.vat || line.vat === rule.vat)
}

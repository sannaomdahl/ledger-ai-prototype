// Ids for what the store adds, shared by the feature modules that add them.
import type { CustomerRequest } from "./types"

/** Next free request id with this prefix ("APR-702"): past every number
    ever used, so a dropped draft never hands its number to a new request.
    Derived from state, so StrictMode's double-invoked reducer agrees. */
export function nextRequestId(requests: CustomerRequest[], prefix: string, base: number) {
  let highest = base + requests.length - 1
  for (const r of requests) {
    const match = r.id.match(/^([A-Z]+)-(\d+)$/)
    if (match && match[1] === prefix) highest = Math.max(highest, Number(match[2]))
  }
  return `${prefix}-${highest + 1}`
}

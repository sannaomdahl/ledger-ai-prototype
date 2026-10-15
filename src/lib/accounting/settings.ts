"use client"

// Preferences that live in this browser, apart from the demo data so a
// "Reset demo data" keeps them. Shared across tabs on the same origin, so
// switching a preview on in the workspace turns it on in the customer's app
// too.
import { useCallback, useSyncExternalStore } from "react"

export type Settings = {
  /** Preview: the balance sheet as it stands today, month by month, for the
      accountant (a Balances tab) and the customer ("Where you stand"). */
  balances: boolean
  /** Preview: the customer draws their signature on the offer link instead
      of clicking a button. */
  drawnSignature: boolean
  /** Preview: the customer's three tabs as a pill floating at the bottom of
      the screen, in place of the tabs above the timeline. */
  floatingTabs: boolean
}

const DEFAULTS: Settings = { balances: false, drawnSignature: false, floatingTabs: false }

const KEY = "ledger-ai-settings-v1"
const EVENT = "ledger-ai-settings"

let cache: { raw: string | null; value: Settings } | null = null

function read(): Settings {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    // Storage blocked: defaults.
  }
  if (cache && cache.raw === raw) return cache.value
  let value = DEFAULTS
  try {
    if (raw) value = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    // A malformed copy falls back to the defaults.
  }
  cache = { raw, value }
  return value
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) onChange()
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(EVENT, onChange)
  }
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, read, () => DEFAULTS)
  const update = useCallback((patch: Partial<Settings>) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }))
    } catch {
      // Storage blocked: the change can't stick.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [settings, update] as const
}

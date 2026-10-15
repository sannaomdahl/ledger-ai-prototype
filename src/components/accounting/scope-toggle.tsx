"use client"

// My customers / All, for browsing screens (Clients, Tasks & requests).
// The sidebar and Home always show my customers.
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAccounting, type Scope } from "@/lib/accounting/store"

export function ScopeToggle() {
  const { state, dispatch } = useAccounting()
  return (
    <Tabs
      value={state.scope}
      onValueChange={(value) =>
        dispatch({ type: "set_scope", scope: value as Scope })
      }
    >
      <TabsList>
        <TabsTrigger value="mine" className="px-2.5">
          My customers
        </TabsTrigger>
        <TabsTrigger value="all" className="px-2.5">
          All
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

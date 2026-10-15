"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { ClientChip } from "@/components/accounting/primitives"
import { isMine, scopedClients } from "@/lib/accounting/store"
import {
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import { HomeIcon, InboxIcon, LandmarkIcon, SearchIcon, UsersIcon } from "lucide-react"

const PAGES = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/clients", label: "Customers", icon: UsersIcon },
  { href: "/requests", label: "Tasks & requests", icon: InboxIcon },
  { href: "/filings", label: "Filings: VAT and annual reports", icon: LandmarkIcon },
]

export function SearchForm({ ...props }: ComponentProps<"form">) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  // Own customers first; the rest of the firm is still one search away.
  const clients = [...scopedClients("all")].sort(
    (a, b) => Number(isMine(b)) - Number(isMine(a)) || a.name.localeCompare(b.name)
  )

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <form {...props}>
      {/* Sidebar */}
      <SidebarGroup className="py-0">
        <SidebarGroupContent className="relative">
          <Button
            id="search"
            type="button"
            variant="outline"
            className="hover:bg-background h-8 w-full justify-start pl-7 font-normal transition-[width] duration-200 ease-linear in-data-[state=collapsed]:w-8! in-data-[state=collapsed]:pl-4! in-data-[state=collapsed]:text-transparent"
            onClick={() => setOpen(true)}
          >
            Search...
          </Button>
          <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 opacity-50 select-none" />
          <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 in-data-[state=collapsed]:hidden">
            ⌘K
          </Kbd>
        </SidebarGroupContent>
      </SidebarGroup>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Jump to a customer or a page."
        className="sm:max-w-lg"
      >
        <Command>
          <CommandInput placeholder="Search customers, org. numbers, pages…" />
          <CommandList>
            <CommandEmpty>No customer or page matches.</CommandEmpty>
            <CommandGroup heading="Customers">
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`${client.name} ${client.orgNo} ${client.industry}`}
                  onSelect={() => go(`/clients/${client.id}`)}
                >
                  <ClientChip client={client} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{client.name}</span>
                  <CommandShortcut>
                    {isMine(client) ? "Mine" : client.industry}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Pages">
              {PAGES.map((page) => (
                <CommandItem
                  key={page.href}
                  value={page.label}
                  onSelect={() => go(page.href)}
                >
                  <page.icon aria-hidden="true" />
                  {page.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </form>
  )
}
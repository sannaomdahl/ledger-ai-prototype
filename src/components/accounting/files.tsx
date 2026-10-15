"use client"

// A client's files, archived the way an accountant keeps them: by year, and
// within a year by what they are (bank statements, supplier invoices,
// receipts, payroll, filings, reports, what the customer sent, company and
// engagement papers). Every row says when it came in, from whom and how, and
// what it belongs to; a click opens the preview with the way to the line or
// conversation.
import { useMemo, useState } from "react"
import { cn } from "cn"
import {
  BuildingIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
  LandmarkIcon,
  SearchIcon,
  SheetIcon,
  UserIcon,
  BotIcon,
} from "lucide-react"

import { Badge } from "@/components/reui/badge"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  clientFiles,
  FOLDERS,
  formatWhen,
  type FileEntry,
  type FolderKey,
  type Uploader,
} from "@/lib/accounting/file-index"
import { useAccounting } from "@/lib/accounting/store"
import { extension, FilePreview, isImageName } from "./file-attachment"

type Who = "all" | "customer" | "us"

const UPLOADER_ICON: Record<Uploader, typeof UserIcon> = {
  customer: UserIcon,
  firm: BuildingIcon,
  agent: BotIcon,
  system: LandmarkIcon,
}

function FileIcon({ name }: { name: string }) {
  const Icon = isImageName(name) ? ImageIcon : /\.(csv|xlsx?)$/i.test(name) ? SheetIcon : FileTextIcon
  return (
    <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4">
      <Icon aria-hidden="true" />
    </span>
  )
}

function FileRow({ file, onOpen }: { file: FileEntry; onOpen: () => void }) {
  const Who = UPLOADER_ICON[file.by.kind]
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-muted/40 focus-visible:ring-ring/50 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 text-left transition-colors duration-150 outline-none focus-visible:ring-3 @3xl/files:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_8.5rem]"
      >
        <FileIcon name={file.name} />
        <span className="flex min-w-0 flex-col">
          <span className="text-foreground truncate text-sm font-medium">{file.name}</span>
          <span className="text-muted-foreground truncate text-xs @3xl/files:hidden">
            {file.by.name} · {formatWhen(file.at)}
          </span>
          <span className="text-muted-foreground hidden truncate text-xs @3xl/files:block">
            {extension(file.name)}
          </span>
        </span>
        <span className="hidden min-w-0 flex-col @3xl/files:flex">
          {file.link ? (
            <>
              <span className="text-foreground truncate text-sm">{file.link.label}</span>
              <span className="text-muted-foreground truncate text-xs">{file.link.detail}</span>
            </>
          ) : null}
        </span>
        <span className="hidden min-w-0 items-center gap-2 @3xl/files:flex">
          <Who className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
          <span className="flex min-w-0 flex-col">
            <span className="text-foreground truncate text-sm">{file.by.name}</span>
            <span className="text-muted-foreground truncate text-xs">{file.via}</span>
          </span>
        </span>
        <span className="text-muted-foreground hidden text-right text-xs tabular-nums @3xl/files:block">
          {formatWhen(file.at)}
        </span>
        <span className="text-muted-foreground text-right text-xs tabular-nums @3xl/files:hidden">
          {file.link?.label}
        </span>
      </button>
    </li>
  )
}

/** Where the reader is in the archive: a year (or every year), and a
    category in it (or all of them). */
type Place = { year: string | "all"; folder: FolderKey | "all" }

function NavButton({
  active,
  open,
  label,
  count,
  indent,
  onClick,
}: {
  active: boolean
  open?: boolean
  label: string
  count: number
  indent?: boolean
  onClick: () => void
}) {
  const Icon = active || open ? FolderOpenIcon : FolderIcon
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-3",
        indent && "@3xl/files:ps-7",
        active
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      {indent ? null : <Icon className="size-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
    </button>
  )
}

export function ClientFiles({ clientId }: { clientId: string }) {
  const { state } = useAccounting()
  const [who, setWho] = useState<Who>("all")
  const [query, setQuery] = useState("")
  const [preview, setPreview] = useState<FileEntry | null>(null)

  const files = useMemo(
    () => clientFiles(clientId, state.items, state.requests, state),
    [clientId, state]
  )
  // Newest year first; the archive opens on it.
  const years = [...new Set(files.map((f) => f.at.slice(0, 4)))].sort((a, b) => b.localeCompare(a))
  const [picked, setPlace] = useState<Place | null>(null)
  const place: Place = picked ?? { year: years[0] ?? "all", folder: "all" }
  const inYear = (year: string) => files.filter((f) => f.at.startsWith(year))
  const count = (year: string, key: FolderKey) => inYear(year).filter((f) => f.folder === key).length

  const q = query.trim().toLowerCase()
  const shown = files.filter(
    (f) =>
      (place.year === "all" || f.at.startsWith(place.year)) &&
      (place.folder === "all" || f.folder === place.folder) &&
      (who === "all" || (who === "customer") === (f.by.kind === "customer")) &&
      (!q ||
        [f.name, f.by.name, f.via, f.link?.label, f.link?.detail]
          .filter(Boolean)
          .some((text) => text!.toLowerCase().includes(q)))
  )
  // Year, then category: one section per pair that has files, newest
  // year first and categories in their usual order.
  const sections = [...new Set(shown.map((f) => f.at.slice(0, 4)))]
    .sort((a, b) => b.localeCompare(a))
    .flatMap((year) =>
      FOLDERS.map((folder) => ({
        year,
        folder,
        files: shown.filter((f) => f.at.startsWith(year) && f.folder === folder.key),
      })).filter((section) => section.files.length)
    )
  const current = FOLDERS.find((f) => f.key === place.folder)
  const fromCustomer = files.filter((f) => f.by.kind === "customer").length
  const title =
    place.year === "all"
      ? "All files"
      : current
        ? `${place.year} · ${current.label}`
        : place.year

  return (
    <div className="@container/files min-w-0">
      <div className="grid min-w-0 items-start gap-4 @3xl/files:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Years, each opening to its categories: a tree beside the files,
            a scrolling row on a phone. */}
        <nav aria-label="Folders" className="min-w-0">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 @3xl/files:flex-col @3xl/files:overflow-visible">
            <li className="shrink-0">
              <NavButton
                active={place.year === "all"}
                label="All files"
                count={files.length}
                onClick={() => setPlace({ year: "all", folder: "all" })}
              />
            </li>
            {years.map((year) => {
              const open = place.year === year
              return (
                <li key={year} className="flex shrink-0 gap-1 @3xl/files:flex-col">
                  <NavButton
                    active={open && place.folder === "all"}
                    open={open}
                    label={year}
                    count={inYear(year).length}
                    onClick={() => setPlace({ year, folder: "all" })}
                  />
                  {open ? (
                    <ul className="flex gap-1 @3xl/files:flex-col">
                      {FOLDERS.filter((f) => count(year, f.key) > 0).map((f) => (
                        <li key={f.key} className="shrink-0">
                          <NavButton
                            active={place.folder === f.key}
                            label={f.label}
                            count={count(year, f.key)}
                            indent
                            onClick={() => setPlace({ year, folder: f.key })}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </nav>

        <Frame dense spacing="sm" className="w-full min-w-0">
          <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-px">
              <FrameTitle>{title}</FrameTitle>
              <FrameDescription className="text-xs">
                {current?.hint ??
                  `${place.year === "all" ? "Everything we hold for this customer" : `${shown.length} files from ${place.year}`} · ${fromCustomer} sent by them in all`}
              </FrameDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={who} onValueChange={(value) => setWho(value as Who)}>
                <TabsList>
                  <TabsTrigger value="all" className="px-2.5">
                    Everyone
                  </TabsTrigger>
                  <TabsTrigger value="customer" className="px-2.5">
                    Customer
                  </TabsTrigger>
                  <TabsTrigger value="us" className="px-2.5">
                    Us &amp; systems
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <InputGroup className="w-52">
                <InputGroupAddon>
                  <SearchIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  placeholder="Search files"
                  aria-label="Search files"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </InputGroup>
            </div>
          </FrameHeader>
          <FramePanel className="p-0">
            <div className="text-muted-foreground hidden grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_8.5rem] gap-x-3 border-b px-3 py-2 text-xs font-medium @3xl/files:grid">
              <span />
              <span>Name</span>
              <span>Belongs to</span>
              <span>From</span>
              <span className="text-right">Received</span>
            </div>
            {sections.length ? (
              sections.map(({ year, folder, files: own }, index) => (
                <section key={`${year}-${folder.key}`} aria-label={`${year} · ${folder.label}`}>
                  {index > 0 ? <Separator /> : null}
                  {/* One category on its own needs no heading of its own. */}
                  {place.folder === "all" || place.year === "all" ? (
                    <h3 className="text-muted-foreground bg-muted/30 flex items-center gap-2 px-3 py-1.5 text-xs font-medium">
                      {place.year === "all" ? `${year} · ${folder.label}` : folder.label}
                      <Badge variant="outline" size="sm" className="tabular-nums">
                        {own.length}
                      </Badge>
                    </h3>
                  ) : null}
                  <ul className="divide-y">
                    {own.map((file) => (
                      <FileRow key={file.id} file={file} onOpen={() => setPreview(file)} />
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <p className="text-muted-foreground px-4 py-10 text-center text-sm text-pretty">
                {q ? `No files match “${query.trim()}”.` : "No files here yet."}
              </p>
            )}
          </FramePanel>
        </Frame>

        {preview ? (
          <FilePreview
            key={preview.id}
            name={preview.name}
            itemId={preview.itemId}
            clientId={clientId}
            entry={preview}
            open
            onOpenChange={(open) => !open && setPreview(null)}
          />
        ) : null}
      </div>
    </div>
  )
}

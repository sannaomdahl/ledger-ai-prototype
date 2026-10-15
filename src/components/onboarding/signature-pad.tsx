"use client"

// Signing the offer by hand (a preview), straight from ReUI: the signature
// pad as in the agreement signing card (c-signature-pad-7), with the signer
// and "Dated on signing" under it, and "draw or type" (c-signature-pad-6) so
// a keyboard reaches the same outcome. It never signs on its own: drawing or
// typing only enables the button, and the button is the act.
import { useState } from "react"

import {
  SignaturePad,
  SignaturePadArea,
  SignaturePadClear,
  SignaturePadControls,
  SignaturePadGuide,
  SignaturePadPlaceholder,
  SignaturePadPreview,
} from "@/components/reui/signature-pad"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "cn"
import type { Signature, SignatureStroke } from "@/lib/accounting/onboarding"

/** A signature given earlier, e.g. on the signed agreement. */
export function SignatureMark({ signature, className }: { signature: Signature; className?: string }) {
  return "typed" in signature ? (
    <span className={cn("text-foreground font-serif text-2xl leading-10 italic", className)}>{signature.typed}</span>
  ) : (
    <SignaturePadPreview strokes={signature.drawn} className={cn("h-10 w-auto", className)} />
  )
}

export function OfferSignature({
  name,
  disabled,
  signedOn,
  onChange,
}: {
  /** Under the line, e.g. "Ola Nordmann, Owner". */
  name: string
  disabled?: boolean
  /** Once signed: the date, and the pad turns read-only. */
  signedOn?: string
  /** What would be signed now, or null while there's nothing. */
  onChange: (signature: Signature | null) => void
}) {
  const [mode, setMode] = useState<"draw" | "type">("draw")
  const [strokes, setStrokes] = useState<SignatureStroke[]>([])
  const [typed, setTyped] = useState("")
  const locked = disabled || Boolean(signedOn)

  function report(next: { mode?: typeof mode; strokes?: SignatureStroke[]; typed?: string }) {
    const m = next.mode ?? mode
    const s = next.strokes ?? strokes
    const t = (next.typed ?? typed).trim()
    onChange(m === "draw" ? (s.length ? { drawn: s } : null) : t.length > 1 ? { typed: t } : null)
  }

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        const next = value === "type" ? "type" : "draw"
        setMode(next)
        report({ mode: next })
      }}
    >
      <TabsList>
        <TabsTrigger value="draw" disabled={locked}>
          Draw
        </TabsTrigger>
        <TabsTrigger value="type" disabled={locked}>
          Type
        </TabsTrigger>
      </TabsList>
      <TabsContent value="draw">
        <SignaturePad
          value={strokes}
          onValueChange={(next) => {
            setStrokes(next)
            report({ strokes: next })
          }}
          disabled={disabled}
          readOnly={Boolean(signedOn)}
        >
          <SignaturePadArea aria-label="Your signature" className="h-36">
            <SignaturePadGuide />
            <SignaturePadPlaceholder />
            {signedOn ? null : (
              <SignaturePadControls position="top-end">
                <SignaturePadClear variant="ghost" />
              </SignaturePadControls>
            )}
          </SignaturePadArea>
        </SignaturePad>
      </TabsContent>
      <TabsContent value="type">
        <div className="flex flex-col gap-2">
          <Input
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              report({ typed: e.target.value })
            }}
            disabled={disabled}
            readOnly={Boolean(signedOn)}
            autoComplete="name"
            placeholder="Your full name"
            aria-label="Your full name, as your signature"
          />
          {/* A visual echo of the input, so it stays out of the reading order. */}
          <p aria-hidden="true" className="flex h-[6.5rem] items-center justify-center border-b border-dashed px-4">
            {typed.trim() ? (
              <span className="truncate font-serif text-3xl italic">{typed.trim()}</span>
            ) : (
              <span className="text-muted-foreground text-sm">Your typed signature appears here</span>
            )}
          </p>
        </div>
      </TabsContent>
      <div className="text-muted-foreground flex justify-between gap-3 text-xs">
        <span className="truncate">{name}</span>
        <span className="shrink-0 tabular-nums">{signedOn ?? "Dated on signing"}</span>
      </div>
    </Tabs>
  )
}

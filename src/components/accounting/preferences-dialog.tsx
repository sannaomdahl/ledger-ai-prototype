"use client"

// Preferences, from the workspace menu. For now it holds previews: features
// to try with customers before they replace what's there. Each is stored in
// this browser and follows into the customer's app in the next tab.
import { FlaskConicalIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/lib/accounting/settings"

export function PreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [settings, update] = useSettings()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>
            Saved in this browser. Previews show up for you and in the customer&apos;s app opened
            from here.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <FlaskConicalIcon className="size-3.5" aria-hidden="true" />
            Previews
          </div>
          <FieldLabel htmlFor="pref-balances">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Balance sheet</FieldTitle>
                <FieldDescription className="text-xs text-pretty">
                  A Balances tab on each client: stock, the loan, cash and what&apos;s owed at each
                  month end, as an overview or a trial balance. Customers get it as &ldquo;Where
                  you stand&rdquo; under Your numbers.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="pref-balances"
                checked={settings.balances}
                onCheckedChange={(checked) => update({ balances: checked })}
              />
            </Field>
          </FieldLabel>
          <FieldLabel htmlFor="pref-signature">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Sign by hand</FieldTitle>
                <FieldDescription className="text-xs text-pretty">
                  On the offer link, the company draws its signature above the button instead of
                  just clicking it. The signature then shows on the agreement, for them and for you.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="pref-signature"
                checked={settings.drawnSignature}
                onCheckedChange={(checked) => update({ drawnSignature: checked })}
              />
            </Field>
          </FieldLabel>
          <FieldLabel htmlFor="pref-floating-tabs">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Floating tabs</FieldTitle>
                <FieldDescription className="text-xs text-pretty">
                  On the customer&apos;s page, Things we need, Your questions and Your numbers
                  float at the bottom of the screen instead of sitting above the timeline, so
                  they stay in reach while scrolling.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="pref-floating-tabs"
                checked={settings.floatingTabs}
                onCheckedChange={(checked) => update({ floatingTabs: checked })}
              />
            </Field>
          </FieldLabel>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  )
}

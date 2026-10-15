"use client"

import { Frame, FramePanel } from "@/components/reui/frame"
import { cn } from "cn"

import { Item, ItemMedia } from "@/components/ui/item"

import { cards } from "./data"

export function Stats() {
  return (
    <div className="@container w-full grow">
      {/* Grid */}
      <div className="mx-auto grid max-w-5xl grow grid-cols-1 gap-5 @3xl:grid-cols-3">
        {cards.map((card, i) => (
          <Frame key={i}>
            <FramePanel className="flex flex-col items-start gap-6">
              <Item
                className={cn(
                  "border-background bg-muted flex size-10.5 items-center justify-center border-2 p-0 shadow-[0_1px_3px_0_rgba(0,0,0,0.14)] dark:border [&_svg]:size-5",
                  card.iconBg
                )}
              >
                <ItemMedia variant="icon" className="size-auto">
                  {card.icon}
                </ItemMedia>
              </Item>

              <div className="space-y-0.5">
                <div className="text-foreground text-2xl leading-none font-bold">
                  {card.value}
                </div>
                <div className="text-muted-foreground text-sm font-medium">
                  {card.label}
                </div>
              </div>

              {card.info}
            </FramePanel>
          </Frame>
        ))}
      </div>
    </div>
  )
}
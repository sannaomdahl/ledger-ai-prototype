"use client"

import type { ComponentType } from "react"
import { Badge } from "@/components/reui/badge"
import { FramePanel } from "@/components/reui/frame"

import { Hotmart } from "@/components/ui/svgs/hotmart"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar"

import type { BottomType, ICard } from "./data"

function HotmartLogo({ className }: { className?: string }) {
  return <Hotmart className={className} aria-hidden="true" />
}

const LOGOS: Record<string, ComponentType<{ className?: string }>> = {
  HotmartLogo,
}

function BottomEl({
  type,
  bottomLogo,
}: {
  type: NonNullable<BottomType>
  bottomLogo?: string
}) {
  if (type === "logo" && bottomLogo && LOGOS[bottomLogo]) {
    const Logo = LOGOS[bottomLogo]
    return <Logo className="size-5" />
  }
  if (type === "badge") {
    return (
      <Badge variant="info-light" size="sm">
        Running
      </Badge>
    )
  }
  return (
    <AvatarGroup>
      <Avatar className="size-5">
        <AvatarImage
          src="https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=96&h=96&dpr=2&q=80"
          alt=""
        />
        <AvatarFallback>A</AvatarFallback>
      </Avatar>
      <Avatar className="size-5">
        <AvatarImage
          src="https://images.unsplash.com/photo-1584308972272-9e4e7685e80f?w=96&h=96&dpr=2&q=80"
          alt=""
        />
        <AvatarFallback>B</AvatarFallback>
      </Avatar>
      <Avatar className="size-5">
        <AvatarImage
          src="https://images.unsplash.com/photo-1485893086445-ed75865251e0?w=96&h=96&dpr=2&q=80"
          alt=""
        />
        <AvatarFallback>C</AvatarFallback>
      </Avatar>
      {/* List */}
      <AvatarGroupCount className="size-5 border text-[10px]">
        +1
      </AvatarGroupCount>
    </AvatarGroup>
  )
}

export function CardItem({ card }: { card: ICard }) {
  return (
    <FramePanel className="space-y-10">
      <div className="flex grow items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">{card.label}</span>
        <div className="[&_svg]:text-muted-foreground [&_svg]:size-4">
          {card.icon}
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1.5">
          {card.primaryHref ? (
            <a
              href={card.primaryHref}
              className="text-primary text-sm leading-tight font-medium hover:underline"
            >
              {card.primary}
            </a>
          ) : (
            <span className="text-sm leading-tight font-medium">
              {card.primary}
            </span>
          )}
          <p className="text-muted-foreground text-sm leading-none">
            {card.secondary}
          </p>
        </div>
        {card.bottom != null && (
          <div className="flex justify-end pt-1">
            <BottomEl type={card.bottom} bottomLogo={card.bottomLogo} />
          </div>
        )}
      </div>
    </FramePanel>
  )
}
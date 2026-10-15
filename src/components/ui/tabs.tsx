"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
        floating:
          "h-12! gap-0.5 rounded-full border bg-background/85 p-1 shadow-lg shadow-black/10 backdrop-blur-md",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      {/* Line tabs share one underline that slides to the active tab, so the
          eye follows the selection instead of watching two lines fade. */}
      {variant === "line" ? (
        <TabsPrimitive.Indicator
          data-slot="tabs-indicator"
          className="bg-foreground pointer-events-none absolute z-10 transition-[left,width,top,height] duration-200 ease-out motion-reduce:transition-none group-data-horizontal/tabs:-bottom-px group-data-horizontal/tabs:left-(--active-tab-left) group-data-horizontal/tabs:h-0.5 group-data-horizontal/tabs:w-(--active-tab-width) group-data-vertical/tabs:top-(--active-tab-top) group-data-vertical/tabs:right-[calc(var(--active-tab-right)-4px)] group-data-vertical/tabs:h-(--active-tab-height) group-data-vertical/tabs:w-0.5"
        />
      ) : null}
      {/* Floating tabs share one soft pill that travels to the active tab,
          the way a floating button group moves its highlight. */}
      {variant === "floating" ? (
        <TabsPrimitive.Indicator
          data-slot="tabs-indicator"
          className="bg-muted dark:bg-foreground/15 pointer-events-none absolute top-(--active-tab-top) left-(--active-tab-left) h-(--active-tab-height) w-(--active-tab-width) rounded-full transition-[left,width] duration-300 motion-reduce:transition-none"
        />
      ) : null}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "group-data-[variant=floating]/tabs-list:z-10 group-data-[variant=floating]/tabs-list:h-full group-data-[variant=floating]/tabs-list:rounded-full group-data-[variant=floating]/tabs-list:px-3 group-data-[variant=floating]/tabs-list:transition-[color,scale] group-data-[variant=floating]/tabs-list:active:scale-[0.97] group-data-[variant=floating]/tabs-list:data-active:bg-transparent motion-reduce:group-data-[variant=floating]/tabs-list:active:scale-100 dark:group-data-[variant=floating]/tabs-list:data-active:border-transparent dark:group-data-[variant=floating]/tabs-list:data-active:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }

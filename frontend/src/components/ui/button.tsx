/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium tracking-[0.01em] transition-[color,background-color,border-color,box-shadow,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "border border-primary/85 bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-primary/92 active:bg-primary/95 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:bg-primary/88",
        destructive:
          "border border-destructive/80 bg-destructive text-white shadow-none hover:bg-destructive/92 active:bg-destructive/95 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/65 dark:hover:bg-destructive/58",
        outline:
          "border border-border/75 bg-background/86 text-foreground shadow-none hover:border-border hover:bg-accent/62 hover:text-accent-foreground dark:bg-white/[0.04] dark:border-white/10 dark:hover:bg-white/[0.065]",
        secondary:
          "border border-border/55 bg-secondary/88 text-secondary-foreground shadow-none hover:bg-secondary active:bg-secondary/94",
        ghost:
          "text-foreground/82 shadow-none hover:bg-accent/62 hover:text-accent-foreground dark:hover:bg-accent/72",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3.5",
        xs: "h-7 gap-1 rounded-[8px] px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 rounded-[9px] gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-11 rounded-[10px] px-6 has-[>svg]:px-4.5",
        icon: "size-10",
        "icon-xs": "size-7 rounded-[8px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-[9px]",
        "icon-lg": "size-11 rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    />
  )
}

export { Button, buttonVariants }

/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium tracking-[0.02em] transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-180 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive motion-reduce:transform-none",
  {
    variants: {
      variant: {
        default:
          "border border-primary/90 bg-primary text-primary-foreground shadow-[0_12px_24px_rgba(51,66,91,0.16),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-primary/94 hover:shadow-[0_14px_28px_rgba(51,66,91,0.2),inset_0_1px_0_rgba(255,255,255,0.12)] active:translate-y-px active:bg-primary active:shadow-[0_8px_18px_rgba(51,66,91,0.16),inset_0_1px_0_rgba(255,255,255,0.08)] dark:shadow-[0_12px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:bg-primary/88 dark:active:bg-primary/82",
        destructive:
          "border border-destructive/80 bg-destructive text-white shadow-none hover:bg-destructive/92 active:translate-y-px active:bg-destructive/95 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/65 dark:hover:bg-destructive/58",
        outline:
          "border border-border/80 bg-background/88 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.26)] hover:border-border hover:bg-accent/68 hover:text-accent-foreground active:translate-y-px active:bg-accent/8 dark:bg-white/[0.04] dark:border-white/10 dark:hover:bg-white/[0.065] dark:active:bg-white/[0.08]",
        secondary:
          "border border-border/55 bg-secondary/88 text-secondary-foreground shadow-none hover:bg-secondary active:translate-y-px active:bg-secondary/94",
        ghost:
          "text-foreground/82 shadow-none hover:bg-accent/62 hover:text-accent-foreground active:translate-y-px active:bg-accent/76 dark:hover:bg-accent/72",
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

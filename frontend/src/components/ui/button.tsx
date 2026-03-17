/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-sm font-medium tracking-[0.01em] transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/35 focus-visible:ring-[3px] focus-visible:-translate-y-px aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "border border-primary/85 bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(47,115,109,0.22)] hover:-translate-y-px hover:bg-primary/92 hover:shadow-[0_16px_36px_rgba(47,115,109,0.26)] dark:shadow-[0_12px_28px_rgba(15,87,82,0.28)] dark:hover:bg-primary/88",
        destructive:
          "border border-destructive/80 bg-destructive text-white shadow-[0_10px_24px_rgba(185,28,28,0.18)] hover:-translate-y-px hover:bg-destructive/92 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/65 dark:hover:bg-destructive/58",
        outline:
          "border border-border/75 bg-background/88 text-foreground shadow-[0_1px_1px_rgba(15,23,42,0.04),0_10px_22px_rgba(15,23,42,0.05)] hover:-translate-y-px hover:border-border hover:bg-accent/70 hover:text-accent-foreground dark:bg-white/[0.04] dark:border-white/10 dark:hover:bg-white/[0.07]",
        secondary:
          "border border-transparent bg-secondary/90 text-secondary-foreground shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:-translate-y-px hover:bg-secondary",
        ghost:
          "text-foreground/82 hover:bg-accent/72 hover:text-accent-foreground dark:hover:bg-accent/72",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3.5",
        xs: "h-7 gap-1 rounded-[12px] px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 rounded-[13px] gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-11 rounded-[15px] px-6 has-[>svg]:px-4.5",
        icon: "size-10",
        "icon-xs": "size-7 rounded-[12px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-[13px]",
        "icon-lg": "size-11 rounded-[15px]",
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

import type { ButtonHTMLAttributes } from 'react'
import { type VariantProps } from 'class-variance-authority'

import { badgeVariants } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ToggleBadgeButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>,
    VariantProps<typeof badgeVariants> {
  pressed: boolean
}

export function ToggleBadgeButton({
  className,
  variant,
  pressed,
  ...props
}: ToggleBadgeButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-pressed={pressed ? 'true' : 'false'}
      className={cn(
        badgeVariants({ variant }),
        'cursor-pointer min-h-10 rounded-full px-3 py-1 text-left transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px active:shadow-none data-[pressed=true]:shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] motion-reduce:transform-none',
        className,
      )}
      {...props}
    />
  )
}

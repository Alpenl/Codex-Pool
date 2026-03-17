import { type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'

import AnimatedContent from '@/components/AnimatedContent'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { resolvePanelRevealMotion } from '@/lib/motion-presets'
import { describeAuthShellLayout } from '@/lib/page-archetypes'
import { cn } from '@/lib/utils'

interface AuthShellProps {
  badge: string
  title: string
  subtitle: string
  points: string[]
  rightSlot: ReactNode
  rightSlotClassName?: string
}

export function AuthShell({
  badge,
  title,
  subtitle,
  points,
  rightSlot,
  rightSlotClassName,
}: AuthShellProps) {
  const prefersReducedMotion = useReducedMotion()
  const panelRevealMotion = resolvePanelRevealMotion(prefersReducedMotion)
  const authLayout = describeAuthShellLayout()

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="page-grid-wash pointer-events-none absolute inset-0 opacity-90 dark:opacity-80" />

      <div className="relative z-10 min-h-dvh px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <div className="mx-auto flex w-full max-w-5xl justify-end gap-2 pb-2 sm:pb-3">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex max-w-5xl sm:min-h-[calc(100dvh-4.5rem)] sm:items-center sm:justify-center">
          <AnimatedContent
            distance={panelRevealMotion.distance}
            duration={panelRevealMotion.duration}
            ease={panelRevealMotion.ease}
            initialOpacity={panelRevealMotion.initialOpacity}
            scale={panelRevealMotion.scale}
            className="w-full max-w-[42rem] lg:max-w-[48rem]"
          >
            <div className="page-stage-surface overflow-hidden rounded-[1.1rem]">
              <div className="grid lg:grid-cols-[minmax(0,1fr)_15rem]">
                <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
                  <div className="space-y-3 border-b border-border/70 pb-5">
                    <div className="inline-flex w-fit items-center gap-2 text-[12px] font-medium tracking-[0.01em] text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-primary/80" />
                      <span>{badge}</span>
                    </div>
                    {authLayout.brandPlacement === 'header' ? (
                      <div className="space-y-1.5">
                        <h1 className="max-w-[18ch] text-balance text-[clamp(1.5rem,3vw,2.2rem)] font-semibold leading-[1.02] tracking-[-0.024em] text-foreground">
                          {title}
                        </h1>
                        <p className="max-w-[58ch] text-sm leading-6 text-muted-foreground sm:text-[15px]">
                          {subtitle}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className={cn('space-y-4', rightSlotClassName)}>{rightSlot}</div>
                </div>

                {points.length > 0 ? (
                  <aside className="hidden border-border/70 lg:flex lg:flex-col lg:justify-between lg:border-l lg:bg-background/30 lg:px-5 lg:py-5">
                    <div className="space-y-3">
                      <div className="text-[11px] font-medium tracking-[0.01em] text-muted-foreground">
                        {badge}
                      </div>
                      {authLayout.supportStyle === 'inline' ? (
                        <ul className="space-y-2.5 text-[13px] leading-6 text-muted-foreground">
                          {points.map((point, index) => (
                            <li key={index} className="flex items-start gap-3">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/55" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </aside>
                ) : null}
              </div>

              {authLayout.footerNotePlacement === 'footer' && points.length > 0 ? (
                <div className="border-t border-border/70 px-5 py-4 lg:hidden sm:px-6">
                  {authLayout.supportStyle === 'inline' ? (
                    <ul className="space-y-2 text-[13px] leading-6 text-muted-foreground">
                      {points.map((point, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/65" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </AnimatedContent>
        </div>
      </div>
    </div>
  )
}

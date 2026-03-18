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
        <div className="mx-auto flex w-full max-w-6xl justify-end gap-2 pb-2 sm:pb-3">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex max-w-6xl sm:min-h-[calc(100dvh-4.5rem)] sm:items-center sm:justify-center">
          <AnimatedContent
            distance={panelRevealMotion.distance}
            duration={panelRevealMotion.duration}
            ease={panelRevealMotion.ease}
            initialOpacity={panelRevealMotion.initialOpacity}
            scale={panelRevealMotion.scale}
            className="w-full max-w-[44rem] lg:max-w-[60rem]"
          >
            <div className="page-stage-surface overflow-hidden rounded-[1.25rem]">
              <div className="grid lg:grid-cols-[minmax(0,1.14fr)_18rem]">
                <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
                  <div className="space-y-4 border-b border-border/70 pb-6">
                    <div className="inline-flex w-fit items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <span className="h-px w-8 bg-primary/65" />
                      <span>{badge}</span>
                    </div>
                    {authLayout.brandPlacement === 'header' ? (
                      <div className="space-y-2.5">
                        <h1 className="max-w-[12ch] text-balance text-[clamp(2.1rem,5vw,3.8rem)] font-semibold leading-[0.94] tracking-[-0.05em] text-foreground">
                          {title}
                        </h1>
                        <p className="max-w-[56ch] text-[15px] leading-8 text-muted-foreground sm:text-[16px]">
                          {subtitle}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className={cn('space-y-4', rightSlotClassName)}>{rightSlot}</div>
                </div>

                {points.length > 0 ? (
                  <aside className="hidden border-border/70 lg:flex lg:flex-col lg:justify-between lg:border-l lg:bg-[linear-gradient(180deg,rgba(58,76,104,0.08),rgba(255,255,255,0))] lg:px-6 lg:py-6 dark:lg:bg-[linear-gradient(180deg,rgba(111,128,160,0.12),rgba(255,255,255,0))]">
                    <div className="space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {badge}
                      </div>
                      {authLayout.supportStyle === 'inline' ? (
                        <ul className="space-y-3 text-[13px] leading-6 text-muted-foreground">
                          {points.map((point, index) => (
                            <li key={index} className="flex items-start gap-3">
                              <span className="mt-2 h-1.5 w-5 shrink-0 rounded-full bg-foreground/55" />
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
                    <ul className="space-y-2.5 text-[13px] leading-6 text-muted-foreground">
                      {points.map((point, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="mt-2 h-1.5 w-5 shrink-0 rounded-full bg-foreground/65" />
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

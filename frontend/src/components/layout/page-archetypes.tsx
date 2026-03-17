import { type HTMLAttributes, type ReactNode } from 'react'

import {
  describePageRegions,
  resolvePageArchetype,
  type PageArchetype,
} from '@/lib/page-archetypes'
import { cn } from '@/lib/utils'

interface PageIntroProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  archetype?: PageArchetype | string
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}

export function PageIntro({
  archetype = 'detail',
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
  ...props
}: PageIntroProps) {
  const config = resolvePageArchetype(archetype)
  const regions = describePageRegions(archetype)

  return (
    <div
      className={cn(
        'flex flex-col gap-4 md:gap-5',
        regions.introAlignment === 'between' && 'lg:flex-row lg:items-end lg:justify-between',
        className,
      )}
      {...props}
    >
      <div className={cn('min-w-0 space-y-3', config.introStyle === 'stage' && 'max-w-2xl md:space-y-4')}>
        {eyebrow ? (
          <div className="inline-flex w-fit items-center rounded-full border border-slate-300/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 shadow-sm dark:border-slate-700/70 dark:bg-slate-950/65 dark:text-slate-300">
            {eyebrow}
          </div>
        ) : null}
        <div className="space-y-2">
          <h1
            className={cn(
              'text-balance font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-50',
              config.introStyle === 'stage'
                ? 'text-[clamp(2.35rem,5vw,4.9rem)] leading-[0.94]'
                : 'text-[clamp(1.9rem,4vw,3.1rem)] leading-[1.02]',
            )}
          >
            {title}
          </h1>
          {description ? (
            <p
              className={cn(
                'text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base',
                config.introStyle === 'stage' && 'max-w-2xl text-[15px] leading-7 sm:text-[17px]',
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {meta ? (
          <div className="text-sm leading-6 text-slate-500 dark:text-slate-400">{meta}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

interface BrandStageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  badge?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  points?: ReactNode[]
  footer?: ReactNode
}

export function BrandStage({
  badge,
  title,
  subtitle,
  points = [],
  footer,
  className,
  ...props
}: BrandStageProps) {
  return (
    <section
      className={cn(
        'page-stage-surface relative overflow-hidden rounded-[1.75rem] p-6 sm:p-8 lg:p-10',
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0.65),rgba(255,255,255,0.12),rgba(255,255,255,0.42))] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.14),rgba(255,255,255,0.02),rgba(255,255,255,0.10))]" />
      <div className="relative z-10 space-y-6">
        {badge ? <div>{badge}</div> : null}
        <div className="space-y-4">
          <h1 className="max-w-3xl text-balance text-[clamp(2.4rem,5vw,5rem)] font-semibold leading-[0.93] tracking-[-0.04em] text-slate-950 dark:text-slate-50">
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-2xl text-[15px] leading-7 text-slate-600 dark:text-slate-300 sm:text-[17px]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {points.length > 0 ? (
          <ul className="grid gap-3 text-sm text-slate-700 dark:text-slate-200 sm:grid-cols-2">
            {points.map((point, index) => (
              <li
                key={index}
                className="flex items-start gap-3 rounded-2xl border border-white/55 bg-white/72 px-4 py-3 shadow-[0_14px_28px_rgba(15,23,42,0.08)] dark:border-white/8 dark:bg-white/[0.04] dark:shadow-none"
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-900 dark:bg-slate-100" />
                <span className="leading-6">{point}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {footer ? <div className="text-sm text-slate-500 dark:text-slate-400">{footer}</div> : null}
      </div>
    </section>
  )
}

interface PagePanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'aside'
  tone?: 'primary' | 'secondary'
}

export function PagePanel({
  as: Component = 'section',
  tone = 'primary',
  className,
  children,
  ...props
}: PagePanelProps) {
  return (
    <Component
      className={cn(
        tone === 'primary' ? 'page-panel-surface' : 'page-panel-surface-muted',
        'rounded-[1.6rem] p-5 sm:p-6',
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

interface WorkspaceShellProps extends HTMLAttributes<HTMLDivElement> {
  intro: ReactNode
  primary: ReactNode
  secondary?: ReactNode
}

export function WorkspaceShell({
  intro,
  primary,
  secondary,
  className,
  ...props
}: WorkspaceShellProps) {
  return (
    <section className={cn('space-y-6 md:space-y-8', className)} {...props}>
      {intro}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0 space-y-6">{primary}</div>
        {secondary ? <aside className="min-w-0 space-y-6">{secondary}</aside> : null}
      </div>
    </section>
  )
}

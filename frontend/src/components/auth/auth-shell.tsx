import { useRef, type ReactNode } from 'react'
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'

import AnimatedContent from '@/components/AnimatedContent'
import FadeContent from '@/components/FadeContent'
import { LanguageToggle } from '@/components/LanguageToggle'
import ShinyText from '@/components/ShinyText'
import { ThemeToggle } from '@/components/ThemeToggle'
import Threads from '@/components/Threads'
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
  const mobileBrandSectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: mobileBrandSectionRef,
    offset: ['start 95%', 'start 28%'],
  })
  const rawOpacity = useTransform(scrollYProgress, [0, 1], [0.35, 1])
  const rawY = useTransform(scrollYProgress, [0, 1], [26, 0])
  const brandOpacity = useSpring(rawOpacity, { stiffness: 120, damping: 24, mass: 0.55 })
  const brandY = useSpring(rawY, { stiffness: 130, damping: 24, mass: 0.5 })

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#f1f4f8] text-[#0f172a] dark:bg-[#060b16] dark:text-[#e2e8f0]">
      <div className="pointer-events-none absolute inset-0 opacity-55 dark:opacity-80">
        <Threads
          color={[0.12, 0.16, 0.24]}
          amplitude={1.1}
          distance={0.2}
          enableMouseInteraction
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.75),rgba(255,255,255,0)_55%),radial-gradient(circle_at_80%_80%,rgba(148,163,184,0.22),rgba(148,163,184,0)_45%)] dark:bg-[radial-gradient(circle_at_15%_15%,rgba(56,189,248,0.12),rgba(56,189,248,0)_45%),radial-gradient(circle_at_78%_82%,rgba(99,102,241,0.16),rgba(99,102,241,0)_44%)]" />

      <div className="relative z-10 min-h-dvh px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <div className="mx-auto flex w-full max-w-7xl justify-end gap-2 pb-2 sm:pb-3">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex max-w-7xl sm:min-h-[calc(100dvh-3.25rem)] sm:items-start lg:items-center">
          <div className="grid w-full gap-0 sm:gap-7 sm:rounded-[1.4rem] sm:border sm:border-slate-200/75 sm:bg-white/78 sm:p-6 sm:shadow-[0_24px_90px_rgba(15,23,42,0.12)] sm:backdrop-blur-xl sm:dark:border-slate-700/60 sm:dark:bg-slate-950/48 sm:dark:shadow-[0_30px_100px_rgba(2,6,23,0.6)] lg:gap-10 lg:rounded-[2rem] lg:p-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
            <AnimatedContent
              distance={28}
              duration={0.28}
              ease="power3.out"
              className="order-2 relative z-10 -mx-3 mt-2 bg-gradient-to-b from-transparent via-white/78 to-white/92 px-3 pb-10 pt-10 dark:via-slate-900/45 dark:to-slate-900/72 sm:mx-0 sm:mt-0 sm:bg-none sm:px-0 sm:pb-0 sm:pt-0 lg:order-1"
            >
              <motion.div
                ref={mobileBrandSectionRef}
                className="mx-auto max-w-[32rem] space-y-6 sm:max-w-none sm:space-y-7"
                style={prefersReducedMotion ? undefined : { opacity: brandOpacity, y: brandY }}
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white/80 px-3 py-1.5 text-xs font-medium tracking-[0.06em] text-slate-700 dark:border-slate-700/80 dark:bg-slate-900/65 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-slate-900 dark:bg-slate-300" />
                  {prefersReducedMotion ? (
                    <span className="dark:text-slate-200">{badge}</span>
                  ) : (
                    <ShinyText
                      text={badge}
                      speed={2}
                      color="rgb(71 85 105)"
                      shineColor="rgb(15 23 42)"
                      className="dark:!text-slate-200"
                      spread={110}
                    />
                  )}
                </div>

                <div className="space-y-4">
                  <h1 className="text-2xl font-semibold leading-tight text-slate-950 dark:text-slate-50 sm:text-4xl lg:text-5xl">
                    {title}
                  </h1>
                  <p className="max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
                    {subtitle}
                  </p>
                </div>

                <ul className="space-y-3">
                  {points.map((point, index) => (
                    <FadeContent
                      key={point}
                      className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200"
                      duration={220}
                      delay={(index + 1) * 70}
                      blur
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-900 dark:bg-slate-100" />
                      <span>{point}</span>
                    </FadeContent>
                  ))}
                </ul>
              </motion.div>
            </AnimatedContent>

            <AnimatedContent
              distance={24}
              direction="horizontal"
              reverse
              duration={0.26}
              ease="power3.out"
              className={cn('order-1 sticky top-[calc(env(safe-area-inset-top)+0.25rem)] z-20 flex min-h-[calc(100dvh-3.25rem)] w-full items-center justify-center sm:static sm:min-h-0 lg:order-2', rightSlotClassName)}
            >
              {rightSlot}
            </AnimatedContent>
          </div>
        </div>
      </div>
    </div>
  )
}

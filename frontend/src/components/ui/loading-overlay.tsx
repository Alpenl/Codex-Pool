import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { resolveFeedbackMotion } from '@/lib/motion-presets'
import { cn } from '@/lib/utils'

type LoadingSize = 'default' | 'compact'

interface LoadingBaseProps {
  title: string
  description?: string
  size?: LoadingSize
}

interface LoadingOverlayProps extends LoadingBaseProps {
  show: boolean
  className?: string
}

interface LoadingScreenProps extends LoadingBaseProps {
  className?: string
}

function LoadingBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-background/76 backdrop-blur-[3px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(84%_64%_at_50%_10%,hsl(var(--primary)/0.14),transparent_64%)]" />
    </>
  )
}

function LoadingContent({
  title,
  description,
  size = 'default',
  reducedMotion = false,
}: LoadingBaseProps & { reducedMotion?: boolean }) {
  const compact = size === 'compact'

  return (
    <div className={cn('max-w-[560px] px-6', compact && 'max-w-[420px] px-4')}>
      <div className="rounded-[1.1rem] border border-border/75 bg-background/88 px-5 py-5 text-center shadow-[0_18px_36px_rgba(67,79,97,0.08),inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-sm dark:bg-card/88 dark:shadow-[0_20px_40px_rgba(0,0,0,0.24)]">
        <div className="mx-auto flex justify-center">
          <div
            className={cn(
              'relative flex items-center justify-center rounded-full border border-primary/16 bg-background/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]',
              compact ? 'h-10 w-10' : 'h-12 w-12',
            )}
          >
            <div className="absolute inset-[3px] rounded-full border border-primary/10 motion-safe:animate-pulse" />
            <div
              className={cn(
                'rounded-full border-2 border-primary/22 border-t-primary animate-spin motion-reduce:animate-none',
                compact ? 'h-5 w-5' : 'h-6 w-6',
              )}
            />
          </div>
        </div>
        <h3
          className={cn(
            'mt-4 font-semibold tracking-tight text-foreground',
            compact ? 'text-sm' : 'text-lg sm:text-xl',
          )}
        >
          {title}
        </h3>
        {description ? (
          <p className={cn('mt-2 text-muted-foreground', compact ? 'text-xs leading-5' : 'text-sm leading-6')}>
            {description}
          </p>
        ) : null}
        <div className="mt-4 overflow-hidden rounded-full border border-border/70 bg-background/76 p-[2px] dark:bg-background/46">
          {reducedMotion ? (
            <div className="h-1.5 rounded-full bg-primary/35" />
          ) : (
            <motion.div
              className="h-1.5 w-1/2 rounded-full bg-primary/72"
              initial={{ x: '-42%' }}
              animate={{ x: '126%' }}
              transition={{
                duration: 1.1,
                repeat: Number.POSITIVE_INFINITY,
                repeatType: 'mirror',
                ease: [0.4, 0, 0.2, 1],
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export function LoadingOverlay({
  show,
  title,
  description,
  size = 'default',
  className,
}: LoadingOverlayProps) {
  const prefersReducedMotion = useReducedMotion()
  const feedbackMotion = resolveFeedbackMotion(prefersReducedMotion)

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="loading-overlay"
          initial={feedbackMotion.initial}
          animate={feedbackMotion.animate}
          exit={feedbackMotion.exit}
          transition={feedbackMotion.transition}
          className={cn('absolute inset-0 z-20', className)}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <LoadingBackdrop />
          <div className="relative flex h-full items-center justify-center">
            <LoadingContent
              title={title}
              description={description}
              size={size}
              reducedMotion={Boolean(prefersReducedMotion)}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function LoadingScreen({
  title,
  description,
  size = 'default',
  className,
}: LoadingScreenProps) {
  const prefersReducedMotion = useReducedMotion()
  const feedbackMotion = resolveFeedbackMotion(prefersReducedMotion)

  return (
    <div
      className={cn('relative flex h-full min-h-[280px] w-full items-center justify-center overflow-hidden bg-background', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingBackdrop />
      <motion.div
        className="relative"
        initial={feedbackMotion.initial}
        animate={feedbackMotion.animate}
        transition={feedbackMotion.transition}
      >
        <LoadingContent
          title={title}
          description={description}
          size={size}
          reducedMotion={Boolean(prefersReducedMotion)}
        />
      </motion.div>
    </div>
  )
}

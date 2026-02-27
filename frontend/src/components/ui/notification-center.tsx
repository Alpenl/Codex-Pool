import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import {
  type NotificationVariant,
  type NotifyPayload,
  subscribeNotifications,
} from '@/lib/notification'

type NotificationItem = {
  id: string
  title: string
  description?: string
  variant: NotificationVariant
  durationMs: number
}

const DEFAULT_DURATION_MS = 4200

function variantClasses(variant: NotificationVariant): string {
  switch (variant) {
    case 'success':
      return 'border-success/30 bg-success-muted text-success-foreground'
    case 'warning':
      return 'border-warning/30 bg-warning-muted text-warning-foreground'
    case 'error':
      return 'border-destructive/30 bg-destructive/10 text-destructive'
    case 'info':
    default:
      return 'border-border/60 bg-card/95 text-foreground'
  }
}

function VariantIcon({ variant }: { variant: NotificationVariant }) {
  if (variant === 'success') {
    return <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
  }
  if (variant === 'warning') {
    return <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
  }
  if (variant === 'error') {
    return <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
  }
  return <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
}

export function NotificationCenter() {
  const { t } = useTranslation()
  const [items, setItems] = useState<NotificationItem[]>([])
  const timers = useRef<Map<string, number>>(new Map())

  const remove = (id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setItems((current) => current.filter((item) => item.id !== id))
  }

  useEffect(() => {
    const timerMap = timers.current

    const unsubscribe = subscribeNotifications((detail: NotifyPayload) => {
      if (!detail?.title) {
        return
      }

      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const item: NotificationItem = {
        id,
        title: detail.title,
        description: detail.description,
        variant: detail.variant ?? 'info',
        durationMs: detail.durationMs ?? DEFAULT_DURATION_MS,
      }

      setItems((current) => {
        const next = [item, ...current]
        return next.slice(0, 4)
      })

      const timer = window.setTimeout(() => {
        remove(id)
      }, item.durationMs)
      timerMap.set(id, timer)
    })

    return () => {
      unsubscribe()
      timerMap.forEach((timerId) => window.clearTimeout(timerId))
      timerMap.clear()
    }
  }, [])

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className={cn(
              'pointer-events-auto rounded-xl border px-3 py-2 shadow-xl backdrop-blur-md',
              variantClasses(item.variant)
            )}
            role="status"
          >
            <div className="flex items-start gap-2">
              <VariantIcon variant={item.variant} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-5">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 text-xs leading-5 opacity-90">{item.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded p-0.5 opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                onClick={() => remove(item.id)}
                aria-label={t('notifications.dismiss', {
                  defaultValue: 'Dismiss notification',
                })}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export type NotificationVariant = 'info' | 'success' | 'warning' | 'error'

export interface NotifyPayload {
  title: string
  description?: string
  variant?: NotificationVariant
  durationMs?: number
}

type NotificationListener = (payload: NotifyPayload) => void

const listeners = new Set<NotificationListener>()
const pendingQueue: NotifyPayload[] = []

export function notify(payload: NotifyPayload) {
  if (!payload?.title) {
    return
  }

  if (listeners.size === 0) {
    pendingQueue.push(payload)
    return
  }

  listeners.forEach((listener) => listener(payload))
}

export function subscribeNotifications(listener: NotificationListener) {
  listeners.add(listener)

  if (pendingQueue.length > 0) {
    const queued = pendingQueue.splice(0, pendingQueue.length)
    queued.forEach((payload) => listener(payload))
  }

  return () => {
    listeners.delete(listener)
  }
}

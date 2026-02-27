import { useMemo, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type AccessibleTabDefinition<T extends string> = {
  value: T
  label: ReactNode
  disabled?: boolean
}

type AccessibleTabsItem<T extends string> = AccessibleTabDefinition<T> & {
  panel: ReactNode
}

type AccessibleTabListProps<T extends string> = {
  idBase: string
  ariaLabel: string
  value: T
  items: AccessibleTabDefinition<T>[]
  onValueChange: (value: T) => void
  tabClassName?: string
  className?: string
}

type AccessibleTabsProps<T extends string> = {
  idBase: string
  ariaLabel: string
  value: T
  items: AccessibleTabsItem<T>[]
  onValueChange: (value: T) => void
  tabClassName?: string
  className?: string
  tabListClassName?: string
  panelClassName?: string
}

function moveIndex<T extends string>(
  items: AccessibleTabDefinition<T>[],
  startIndex: number,
  step: 1 | -1,
): number {
  if (items.length === 0) {
    return -1
  }

  let index = startIndex
  for (let count = 0; count < items.length; count += 1) {
    index = (index + step + items.length) % items.length
    if (!items[index]?.disabled) {
      return index
    }
  }

  return startIndex
}

export function AccessibleTabs<T extends string>({
  idBase,
  ariaLabel,
  value,
  items,
  onValueChange,
  tabClassName,
  className,
  tabListClassName,
  panelClassName,
}: AccessibleTabsProps<T>) {
  const activeIndex = useMemo(
    () => items.findIndex((item) => item.value === value),
    [items, value],
  )
  const resolvedIndex = activeIndex >= 0 ? activeIndex : 0
  const activeItem = items[resolvedIndex]

  if (!activeItem) {
    return null
  }

  return (
    <div className={cn('space-y-4', className)}>
      <AccessibleTabList
        idBase={idBase}
        ariaLabel={ariaLabel}
        value={value}
        items={items}
        onValueChange={onValueChange}
        tabClassName={tabClassName}
        className={tabListClassName}
      />

      {items.map((item) => {
        const selected = item.value === activeItem.value
        const tabId = `${idBase}-tab-${item.value}`
        const panelId = `${idBase}-panel-${item.value}`

        return (
          <div
            key={item.value}
            id={panelId}
            role="tabpanel"
            tabIndex={0}
            hidden={!selected}
            aria-labelledby={tabId}
            className={cn(panelClassName, !selected && 'hidden')}
          >
            {selected ? item.panel : null}
          </div>
        )
      })}
    </div>
  )
}

export function AccessibleTabList<T extends string>({
  idBase,
  ariaLabel,
  value,
  items,
  onValueChange,
  tabClassName,
  className,
}: AccessibleTabListProps<T>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeIndex = useMemo(
    () => items.findIndex((item) => item.value === value),
    [items, value],
  )
  const resolvedIndex = activeIndex >= 0 ? activeIndex : 0
  const firstEnabledIndex = useMemo(
    () => items.findIndex((tab) => !tab.disabled),
    [items],
  )
  const lastEnabledIndex = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (!items[index]?.disabled) {
        return index
      }
    }
    return -1
  }, [items])

  const focusAndSelect = (nextIndex: number) => {
    const next = items[nextIndex]
    if (!next || next.disabled) {
      return
    }
    onValueChange(next.value)
    tabRefs.current[nextIndex]?.focus()
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="border-b">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn('flex items-center gap-1 overflow-x-auto', className)}
      >
        {items.map((item, index) => {
          const selected = index === resolvedIndex
          const tabId = `${idBase}-tab-${item.value}`
          const panelId = `${idBase}-panel-${item.value}`

          return (
            <button
              key={item.value}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              disabled={item.disabled}
              tabIndex={selected ? 0 : -1}
              className={cn(
                'border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                item.disabled && 'cursor-not-allowed opacity-50',
                tabClassName,
              )}
              onClick={() => {
                if (!item.disabled) {
                  onValueChange(item.value)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  focusAndSelect(moveIndex(items, index, 1))
                  return
                }
                if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  focusAndSelect(moveIndex(items, index, -1))
                  return
                }
                if (event.key === 'Home') {
                  event.preventDefault()
                  focusAndSelect(firstEnabledIndex >= 0 ? firstEnabledIndex : resolvedIndex)
                  return
                }
                if (event.key === 'End') {
                  event.preventDefault()
                  focusAndSelect(lastEnabledIndex >= 0 ? lastEnabledIndex : resolvedIndex)
                }
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

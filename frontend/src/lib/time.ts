import { formatDistanceToNow } from 'date-fns'
import { enUS, ja, ru, zhCN, zhTW } from 'date-fns/locale'

type SupportedLocale = typeof enUS

function resolveDateFnsLocale(language?: string): SupportedLocale {
    const normalized = (language || '').toLowerCase()
    if (normalized.startsWith('zh-tw')) return zhTW
    if (normalized.startsWith('zh')) return zhCN
    if (normalized.startsWith('ja')) return ja
    if (normalized.startsWith('ru')) return ru
    return enUS
}

export function formatRelativeTime(
    value: Date | number | string,
    language?: string,
    addSuffix = true,
): string {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
        return '-'
    }
    return formatDistanceToNow(date, {
        addSuffix,
        locale: resolveDateFnsLocale(language),
    })
}

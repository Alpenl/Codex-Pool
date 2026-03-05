import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import zhCN from './locales/zh-CN'
import type { ResourceLanguage } from 'i18next'

export const supportedLanguages = ['en', 'zh-CN', 'zh-TW', 'ja', 'ru'] as const
const fallbackLanguage = 'zh-CN' as const

type SupportedLanguage = (typeof supportedLanguages)[number]
type LocaleModule = { default: ResourceLanguage }

const languageLoaders: Record<SupportedLanguage, () => Promise<LocaleModule>> = {
    en: () => import('./locales/en'),
    'zh-CN': async () => ({ default: zhCN }),
    'zh-TW': () => import('./locales/zh-TW'),
    ja: () => import('./locales/ja'),
    ru: () => import('./locales/ru'),
}

const loadedLanguages = new Set<SupportedLanguage>([fallbackLanguage])
const loadingLanguages = new Map<SupportedLanguage, Promise<void>>()

function normalizeLanguage(rawLanguage?: string | null): SupportedLanguage {
    if (!rawLanguage) {
        return fallbackLanguage
    }

    const normalized = rawLanguage.trim().replace('_', '-').toLowerCase()
    if (!normalized || normalized === 'cimode') {
        return fallbackLanguage
    }

    if (normalized === 'en' || normalized.startsWith('en-')) {
        return 'en'
    }
    if (normalized === 'ja' || normalized.startsWith('ja-')) {
        return 'ja'
    }
    if (normalized === 'ru' || normalized.startsWith('ru-')) {
        return 'ru'
    }
    if (normalized === 'zh-tw' || normalized.startsWith('zh-tw') || normalized.startsWith('zh-hant')) {
        return 'zh-TW'
    }
    if (
        normalized === 'zh'
        || normalized === 'zh-cn'
        || normalized.startsWith('zh-cn')
        || normalized.startsWith('zh-hans')
    ) {
        return 'zh-CN'
    }

    return fallbackLanguage
}

async function loadLanguageResources(language: SupportedLanguage) {
    if (loadedLanguages.has(language)) {
        return
    }

    const existingTask = loadingLanguages.get(language)
    if (existingTask) {
        await existingTask
        return
    }

    const task = languageLoaders[language]()
        .then((module) => {
            i18n.addResourceBundle(language, 'translation', module.default, true, true)
            loadedLanguages.add(language)
        })
        .finally(() => {
            loadingLanguages.delete(language)
        })
    loadingLanguages.set(language, task)
    await task
}

async function ensureSupportedLanguage(language?: string | null) {
    const nextLanguage = normalizeLanguage(language)
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.setItem('codex-ui-language', nextLanguage)
        } catch {
            // ignore storage errors (private mode / quota)
        }
        const url = new URL(window.location.href)
        if (url.searchParams.has('lng')) {
            url.searchParams.delete('lng')
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
        }
    }
    await loadLanguageResources(nextLanguage)
    if (i18n.language !== nextLanguage) {
        await i18n.changeLanguage(nextLanguage)
    }
}

export async function setAppLanguage(language?: string | null) {
    await ensureSupportedLanguage(language)
}

const initPromise = i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            'zh-CN': { translation: zhCN },
        },
        supportedLngs: [...supportedLanguages],
        partialBundledLanguages: true,
        // Keep region-specific Chinese locales resolvable (zh-CN / zh-TW).
        nonExplicitSupportedLngs: false,
        fallbackLng: fallbackLanguage,
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            lookupLocalStorage: 'codex-ui-language',
            caches: ['localStorage'],
            excludeCacheFor: ['cimode'],
        },
        interpolation: {
            escapeValue: false,
        },
})

i18n.on('languageChanged', (language) => {
    void ensureSupportedLanguage(language)
})

void initPromise.then(() => {
    void ensureSupportedLanguage(i18n.resolvedLanguage ?? i18n.language)
})

export default i18n

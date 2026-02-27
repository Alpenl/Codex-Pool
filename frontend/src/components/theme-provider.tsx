/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react"

export type Theme = "light" | "dark" | "colorful" | "aurora" | "system"

type ThemeProviderProps = {
    children: React.ReactNode
    defaultTheme?: Theme
    storageKey?: string
}

type ThemeProviderState = {
    theme: Theme
    setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "codex-ui-theme",
    ...props
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(
        () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
    )

    useEffect(() => {
        const root = window.document.documentElement

        const applyThemeClass = (effectiveTheme: Exclude<Theme, "system">) => {
            // Remove all previous themes
            root.classList.remove("light", "dark", "colorful", "aurora")
            root.classList.add(effectiveTheme)
        }

        if (theme !== "system") {
            applyThemeClass(theme)
            return
        }

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
        const syncSystemTheme = () => {
            applyThemeClass(mediaQuery.matches ? "dark" : "light")
        }

        syncSystemTheme()
        mediaQuery.addEventListener("change", syncSystemTheme)
        return () => mediaQuery.removeEventListener("change", syncSystemTheme)
    }, [theme])

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            localStorage.setItem(storageKey, theme)
            setTheme(theme)
        },
    }

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext)

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider")

    return context
}

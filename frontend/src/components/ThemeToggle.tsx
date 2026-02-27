import { Moon, Palette, Sparkles, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { useTranslation } from "react-i18next"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
    const { setTheme } = useTheme()
    const { t } = useTranslation()

    return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-11 h-11 rounded-full bg-background/20 backdrop-blur-md border border-border/50 hover:bg-background/40">
                    <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0 colorful:-rotate-90 colorful:scale-0 aurora:-rotate-90 aurora:scale-0" />
                    <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100 colorful:-rotate-90 colorful:scale-0 aurora:-rotate-90 aurora:scale-0" />
                    <Palette className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-transform colorful:rotate-0 colorful:scale-100 dark:-rotate-90 dark:scale-0 aurora:-rotate-90 aurora:scale-0" />
                    <Sparkles className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-transform aurora:rotate-0 aurora:scale-100 dark:-rotate-90 dark:scale-0 colorful:-rotate-90 colorful:scale-0 text-success" />
                    <span className="sr-only">{t('common.toggleTheme')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")} className="min-h-10 gap-2 cursor-pointer">
                    <Sun className="h-4 w-4" /> {t('theme.light')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")} className="min-h-10 gap-2 cursor-pointer">
                    <Moon className="h-4 w-4" /> {t('theme.dark')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("colorful")} className="min-h-10 gap-2 cursor-pointer text-info">
                    <Palette className="h-4 w-4" /> {t('theme.colorful')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("aurora")} className="min-h-10 gap-2 cursor-pointer text-success">
                    <Sparkles className="h-4 w-4" /> {t('theme.aurora')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

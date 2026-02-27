import { Globe } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function LanguageToggle() {
    const { i18n, t } = useTranslation()

    const languages = [
        { code: 'zh-CN', label: '简体中文' },
        { code: 'zh-TW', label: '繁體中文' },
        { code: 'en', label: 'English' },
        { code: 'ja', label: '日本語' },
        { code: 'ru', label: 'Русский' },
    ]

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="w-11 h-11 rounded-full bg-background/20 backdrop-blur-md border border-border/50 hover:bg-background/40">
                    <Globe className="h-[1.1rem] w-[1.1rem] text-muted-foreground transition-colors hover:text-foreground" />
                    <span className="sr-only">{t('common.toggleLanguage')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[9rem]">
                {languages.map((lng) => (
                    <DropdownMenuItem
                        key={lng.code}
                        onClick={() => i18n.changeLanguage(lng.code)}
                        className={`min-h-10 cursor-pointer text-sm ${i18n.resolvedLanguage === lng.code ? 'bg-primary/10 font-bold text-primary' : ''}`}
                    >
                        {lng.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

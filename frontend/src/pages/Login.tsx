import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import FadeContent from '@/components/FadeContent'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  extractApiErrorCode,
  extractApiErrorStatus,
} from '@/api/client'
import { localizeApiErrorDisplay } from '@/api/errorI18n'
import { notify } from '@/lib/notification'

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<void>
}

export default function Login({ onLogin }: LoginProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const brandPoints = useMemo(
    () => [
      t('login.brand.points.audit'),
      t('login.brand.points.security'),
      t('login.brand.points.resilience'),
    ],
    [t],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      await onLogin(username.trim(), password)
    } catch (err) {
      const code = extractApiErrorCode(err)
      const status = extractApiErrorStatus(err)

      if (status === 401 || code === 'unauthorized') {
        // 401 由全局拦截器统一触发 notification，避免重复提示。
        return
      } else {
        const fallback = t('login.messages.failed')
        const display = localizeApiErrorDisplay(t, err, fallback)
        notify({
          variant: 'error',
          title: t('notifications.loginFailed.title'),
          description: display.label,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      badge={t('login.brand.badge')}
      title={t('login.brand.title')}
      subtitle={t('login.brand.subtitle')}
      points={brandPoints}
      rightSlot={
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {t('login.title')}
            </p>
            <h2 className="max-w-[14ch] text-balance text-[clamp(1.5rem,2.8vw,2.2rem)] font-semibold leading-[0.96] tracking-[-0.042em] text-foreground">
              {t('login.subtitle')}
            </h2>
            <div className="max-w-[48ch] border-l-2 border-primary/40 pl-4 text-sm leading-7 text-muted-foreground">
              {t('login.securityHint')}
            </div>
          </div>

          <form className="space-y-4 sm:space-y-5" onSubmit={submit}>
            <FadeContent blur duration={220}>
              <div className="space-y-2">
                <label htmlFor="admin-username" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t('login.username')}
                </label>
                <Input
                  id="admin-username"
                  name="username"
                  value={username}
                  autoComplete="username"
                  spellCheck={false}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('login.usernamePlaceholder')}
                  className="h-12 shadow-none sm:h-12"
                />
              </div>
            </FadeContent>

            <FadeContent blur duration={220} delay={60}>
              <div className="space-y-2">
                <label htmlFor="admin-password" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t('login.password')}
                </label>
                <Input
                  id="admin-password"
                  name="password"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  className="h-12 shadow-none sm:h-12"
                />
              </div>
            </FadeContent>

            <FadeContent blur duration={220} delay={100}>
              <Button
                className="h-12 w-full shadow-none"
                type="submit"
                disabled={loading || !password}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t('login.submit')}
              </Button>
            </FadeContent>
          </form>
        </div>
      }
    />
  )
}

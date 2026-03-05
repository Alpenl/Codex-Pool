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
        <div className="w-full max-w-[31rem]">
          <div className="rounded-[1.25rem] border border-slate-200/80 bg-white/92 p-4 shadow-[0_20px_55px_rgba(15,23,42,0.14)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/72 sm:rounded-[1.6rem] sm:p-8">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t('login.title')}
              </p>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50 sm:text-3xl">
                {t('login.subtitle')}
              </h2>
            </div>

            <form className="mt-5 space-y-3.5 sm:mt-7 sm:space-y-4" onSubmit={submit}>
              <FadeContent blur duration={220}>
                <div className="space-y-2">
                  <label htmlFor="admin-username" className="text-sm text-slate-600 dark:text-slate-300">
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
                    className="h-10 rounded-xl border-slate-300 bg-white/85 text-slate-900 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 sm:h-11"
                  />
                </div>
              </FadeContent>

              <FadeContent blur duration={220} delay={60}>
                <div className="space-y-2">
                  <label htmlFor="admin-password" className="text-sm text-slate-600 dark:text-slate-300">
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
                    className="h-10 rounded-xl border-slate-300 bg-white/85 text-slate-900 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 sm:h-11"
                  />
                </div>
              </FadeContent>

              <FadeContent blur duration={220} delay={100}>
                <Button
                  className="h-10 w-full rounded-xl bg-slate-950 text-slate-50 shadow-lg transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 sm:h-11"
                  type="submit"
                  disabled={loading || !password}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('login.submit')}
                </Button>
              </FadeContent>
            </form>

            <p className="mt-3 hidden text-xs text-slate-500 dark:text-slate-400 sm:mt-4 sm:block">{t('login.securityHint')}</p>
          </div>
        </div>
      }
    />
  )
}

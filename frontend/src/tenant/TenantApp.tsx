import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  KeyRound,
  LayoutDashboard,
  ReceiptText,
  TerminalSquare,
} from 'lucide-react'

import AnimatedContent from '@/components/AnimatedContent'
import FadeContent from '@/components/FadeContent'
import { AuthShell } from '@/components/auth/auth-shell'
import { AppLayout, type AppLayoutMenuGroup } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { tenantAuthApi } from '@/api/tenantAuth'
import type { SystemCapabilitiesResponse } from '@/api/types'
import {
  TENANT_AUTH_REQUIRED_EVENT,
  TENANT_LOGIN_FAILED_EVENT,
  extractTenantApiErrorMessage,
} from '@/api/tenantClient'
import { clearTenantAccessToken, setTenantAccessToken } from '@/lib/tenant-session'

const TenantDashboardPage = lazy(() =>
  import('@/tenant/pages/DashboardPage').then((module) => ({
    default: module.TenantDashboardPage,
  })),
)
const TenantUsagePage = lazy(() =>
  import('@/tenant/pages/UsagePage').then((module) => ({
    default: module.TenantUsagePage,
  })),
)
const TenantBillingPage = lazy(() =>
  import('@/tenant/pages/BillingPage').then((module) => ({
    default: module.TenantBillingPage,
  })),
)
const TenantLogsPage = lazy(() =>
  import('@/tenant/pages/LogsPage').then((module) => ({
    default: module.TenantLogsPage,
  })),
)
const TenantApiKeysPage = lazy(() =>
  import('@/tenant/pages/ApiKeysPage').then((module) => ({
    default: module.TenantApiKeysPage,
  })),
)

type AuthMode = 'login' | 'register'
type AuthScreen = 'auth' | 'verify' | 'forgot'
type ForgotStep = 'request' | 'reset'

const LABEL_CLASS_NAME = 'text-xs font-medium text-slate-600 dark:text-slate-300'
const CARD_CLASS_NAME =
  'w-full max-w-[32rem] space-y-6'
const INPUT_CLASS_NAME =
  'h-10 rounded-xl border-slate-300 bg-white/90 text-slate-900 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 sm:h-11'
const TAB_ACTIVE_CLASS_NAME =
  'bg-slate-950 text-slate-50 shadow dark:bg-slate-100 dark:text-slate-900'
const TAB_INACTIVE_CLASS_NAME =
  'bg-transparent text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-700/60'

interface TenantAppProps {
  capabilities: SystemCapabilitiesResponse
}

export function TenantApp({ capabilities }: TenantAppProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const allowTenantSelfService = capabilities.features.tenant_self_service
  const [authChecked, setAuthChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authScreen, setAuthScreen] = useState<AuthScreen>('auth')
  const [forgotStep, setForgotStep] = useState<ForgotStep>('request')

  const [registerForm, setRegisterForm] = useState({
    tenant_name: '',
    email: '',
    password: '',
  })
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('')
  const [verifyForm, setVerifyForm] = useState({ email: '', code: '' })
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [forgotForm, setForgotForm] = useState({ email: '' })
  const [resetForm, setResetForm] = useState({
    email: '',
    code: '',
    new_password: '',
  })

  const tenantBrandPoints = useMemo(
    () => [
      t('tenantApp.auth.brand.points.audit'),
      t('tenantApp.auth.brand.points.security'),
      t('tenantApp.auth.brand.points.resilience'),
    ],
    [t],
  )

  const clearFeedback = () => {
    setError(null)
    setNotice(null)
  }

  const openAuthScreen = (mode: AuthMode = 'login') => {
    setAuthScreen('auth')
    setAuthMode(allowTenantSelfService ? mode : 'login')
    setForgotStep('request')
    clearFeedback()
  }

  useEffect(() => {
    let cancelled = false
    tenantAuthApi
      .me()
      .then(() => {
        if (!cancelled) {
          setAuthenticated(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthenticated(false)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthChecked(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onAuthRequired = () => {
      clearTenantAccessToken()
      queryClient.clear()
      setAuthenticated(false)
      setAuthChecked(true)
      setAuthScreen('auth')
      setAuthMode('login')
      setForgotStep('request')
      setNotice(t('tenantApp.auth.notice.sessionExpired'))
    }
    const onLoginFailed = () => {
      setError(t('tenantApp.auth.error.invalidCredentialsOrUnverified'))
    }
    window.addEventListener(TENANT_AUTH_REQUIRED_EVENT, onAuthRequired)
    window.addEventListener(TENANT_LOGIN_FAILED_EVENT, onLoginFailed)
    return () => {
      window.removeEventListener(TENANT_AUTH_REQUIRED_EVENT, onAuthRequired)
      window.removeEventListener(TENANT_LOGIN_FAILED_EVENT, onLoginFailed)
    }
  }, [queryClient, t])

  const loginMutation = useMutation({
    mutationFn: async () => tenantAuthApi.login(loginForm.email, loginForm.password),
    onSuccess: (response) => {
      setTenantAccessToken(response.access_token)
      setAuthenticated(true)
      setAuthChecked(true)
      setError(null)
      setNotice(t('tenantApp.auth.notice.loginSuccess'))
    },
    onError: (err) =>
      setError(
        extractTenantApiErrorMessage(err)
          || t('tenantApp.auth.error.loginFailed'),
      ),
  })

  const registerMutation = useMutation({
    mutationFn: async () => tenantAuthApi.register(registerForm),
    onSuccess: (response) => {
      setError(null)
      setVerifyForm((prev) => ({ ...prev, email: registerForm.email }))
      setAuthScreen('verify')
      setAuthMode('login')
      setRegisterConfirmPassword('')
      setNotice(
        response.debug_code
          ? t('tenantApp.auth.notice.registerDebugCode', {
            code: response.debug_code,
          })
          : t('tenantApp.auth.notice.registerSuccess'),
      )
    },
    onError: (err) =>
      setError(
        extractTenantApiErrorMessage(err)
          || t('tenantApp.auth.error.registerFailed'),
      ),
  })

  const verifyMutation = useMutation({
    mutationFn: async () => tenantAuthApi.verifyEmail(verifyForm.email, verifyForm.code),
    onSuccess: () => {
      setError(null)
      setAuthScreen('auth')
      setAuthMode('login')
      setNotice(t('tenantApp.auth.notice.emailVerified'))
    },
    onError: (err) =>
      setError(
        extractTenantApiErrorMessage(err)
          || t('tenantApp.auth.error.verificationFailed'),
      ),
  })

  const forgotMutation = useMutation({
    mutationFn: async () => tenantAuthApi.forgotPassword(forgotForm.email),
    onSuccess: (response) => {
      setError(null)
      setResetForm((prev) => ({ ...prev, email: forgotForm.email }))
      setForgotStep('reset')
      setNotice(
        response.debug_code
          ? t('tenantApp.auth.notice.resetCodeDebug', {
            code: response.debug_code,
          })
          : t('tenantApp.auth.notice.resetCodeSentIfExists'),
      )
    },
    onError: (err) =>
      setError(
        extractTenantApiErrorMessage(err)
          || t('tenantApp.auth.error.sendResetCodeFailed'),
      ),
  })

  const resetMutation = useMutation({
    mutationFn: async () =>
      tenantAuthApi.resetPassword(resetForm.email, resetForm.code, resetForm.new_password),
    onSuccess: () => {
      setError(null)
      setForgotStep('request')
      setAuthScreen('auth')
      setAuthMode('login')
      setNotice(t('tenantApp.auth.notice.passwordResetSuccess'))
    },
    onError: (err) =>
      setError(
        extractTenantApiErrorMessage(err)
          || t('tenantApp.auth.error.passwordResetFailed'),
      ),
  })

  const logoutMutation = useMutation({
    mutationFn: async () => tenantAuthApi.logout(),
    onSettled: () => {
      clearTenantAccessToken()
      queryClient.clear()
      setAuthenticated(false)
      setAuthChecked(true)
      setAuthScreen('auth')
      setAuthMode('login')
      setForgotStep('request')
    },
  })

  const handleLogout = async () => {
    await logoutMutation.mutateAsync()
  }

  const tenantMenuGroups = useMemo<AppLayoutMenuGroup[]>(
    () => [
      {
        label: t('tenantApp.menu.analytics'),
        items: [
          {
            path: '/dashboard',
            icon: LayoutDashboard,
            label: t('tenantApp.menu.dashboard'),
            roles: ['tenant'],
          },
          {
            path: '/usage',
            icon: Activity,
            label: t('tenantApp.menu.usage'),
            roles: ['tenant'],
          },
          {
            path: '/billing',
            icon: ReceiptText,
            label: t('tenantApp.menu.billing'),
            roles: ['tenant'],
          },
          {
            path: '/logs',
            icon: TerminalSquare,
            label: t('tenantApp.menu.logs'),
            roles: ['tenant'],
          },
        ],
      },
      {
        label: t('tenantApp.menu.assets'),
        items: [
          {
            path: '/api-keys',
            icon: KeyRound,
            label: t('tenantApp.menu.apiKeys'),
            roles: ['tenant'],
          },
        ],
      },
    ],
    [t],
  )

  const handleLoginSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearFeedback()
    loginMutation.mutate()
  }

  const handleRegisterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearFeedback()
    if (registerForm.password !== registerConfirmPassword) {
      setError(t('tenantApp.auth.error.passwordMismatch'))
      return
    }
    registerMutation.mutate()
  }

  const handleVerifySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearFeedback()
    verifyMutation.mutate()
  }

  const handleForgotRequestSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearFeedback()
    forgotMutation.mutate()
  }

  const handleResetSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearFeedback()
    resetMutation.mutate()
  }

  const openForgotPassword = () => {
    setForgotForm({ email: loginForm.email })
    setResetForm((prev) => ({ ...prev, email: loginForm.email }))
    setForgotStep('request')
    setAuthScreen('forgot')
    clearFeedback()
  }

  const statusNode = (
    <div className="space-y-2">
      {error ? (
        <p
          className="rounded-xl border border-red-200/80 bg-red-50/90 px-3 py-2 text-xs text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
          role="status"
          aria-live="polite"
        >
          {notice}
        </p>
      ) : null}
    </div>
  )

  const authCard = (
    <div className={CARD_CLASS_NAME}>
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
          {t('tenantApp.auth.brand.badge')}
        </p>
        <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50 sm:text-3xl">
          {authMode === 'login' || !allowTenantSelfService
            ? t('tenantApp.auth.sections.loginTitle')
            : t('tenantApp.auth.sections.registerTitle')}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('tenantApp.auth.sections.authSubtitle')}
        </p>
      </div>

      {allowTenantSelfService ? (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100/90 p-1 dark:bg-slate-800/80 sm:mt-6">
          <button
            type="button"
            className={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition ${authMode === 'login'
              ? TAB_ACTIVE_CLASS_NAME
              : TAB_INACTIVE_CLASS_NAME}`}
            onClick={() => {
              setAuthMode('login')
              clearFeedback()
            }}
          >
            {t('tenantApp.auth.tabs.login')}
          </button>
          <button
            type="button"
            className={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition ${authMode === 'register'
              ? TAB_ACTIVE_CLASS_NAME
              : TAB_INACTIVE_CLASS_NAME}`}
            onClick={() => {
              setAuthMode('register')
              clearFeedback()
            }}
          >
            {t('tenantApp.auth.tabs.register')}
          </button>
        </div>
      ) : null}

      <AnimatedContent
        key={allowTenantSelfService ? authMode : 'login'}
        distance={22}
        duration={0.26}
        ease="power3.out"
        className="mt-4 sm:mt-6"
      >
        {authMode === 'login' || !allowTenantSelfService ? (
          <form className="space-y-3.5 sm:space-y-4" onSubmit={handleLoginSubmit}>
            <div className="space-y-2">
              <label htmlFor="tenant-login-email" className={LABEL_CLASS_NAME}>
                {t('tenantApp.auth.fields.email')}
              </label>
              <Input
                id="tenant-login-email"
                name="email"
                type="email"
                inputMode="email"
                value={loginForm.email}
                autoComplete="email"
                spellCheck={false}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder={t('tenantApp.auth.placeholders.email')}
                className={INPUT_CLASS_NAME}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="tenant-login-password" className={LABEL_CLASS_NAME}>
                {t('tenantApp.auth.fields.password')}
              </label>
              <Input
                id="tenant-login-password"
                name="password"
                type="password"
                value={loginForm.password}
                autoComplete="current-password"
                onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder={t('tenantApp.auth.placeholders.password')}
                className={INPUT_CLASS_NAME}
              />
            </div>

            {allowTenantSelfService ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                onClick={openForgotPassword}
              >
                {t('tenantApp.auth.actions.openForgot')}
              </button>
            ) : null}

            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="h-11 w-full rounded-xl bg-slate-950 text-slate-50 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {t('tenantApp.auth.actions.login')}
            </Button>
          </form>
        ) : (
          <form className="space-y-3.5 sm:space-y-4" onSubmit={handleRegisterSubmit}>
            <div className="space-y-2">
              <label htmlFor="tenant-register-name" className={LABEL_CLASS_NAME}>
                {t('tenantApp.auth.fields.tenantName')}
              </label>
              <Input
                id="tenant-register-name"
                name="tenant_name"
                value={registerForm.tenant_name}
                autoComplete="organization"
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, tenant_name: e.target.value }))}
                placeholder={t('tenantApp.auth.placeholders.tenantName')}
                className={INPUT_CLASS_NAME}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="tenant-register-email" className={LABEL_CLASS_NAME}>
                {t('tenantApp.auth.fields.email')}
              </label>
              <Input
                id="tenant-register-email"
                name="email"
                type="email"
                inputMode="email"
                value={registerForm.email}
                autoComplete="email"
                spellCheck={false}
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder={t('tenantApp.auth.placeholders.email')}
                className={INPUT_CLASS_NAME}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="tenant-register-password" className={LABEL_CLASS_NAME}>
                {t('tenantApp.auth.fields.passwordMin8')}
              </label>
              <Input
                id="tenant-register-password"
                name="password"
                type="password"
                value={registerForm.password}
                autoComplete="new-password"
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder={t('tenantApp.auth.placeholders.password')}
                className={INPUT_CLASS_NAME}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="tenant-register-password-confirm" className={LABEL_CLASS_NAME}>
                {t('tenantApp.auth.fields.confirmPassword')}
              </label>
              <Input
                id="tenant-register-password-confirm"
                name="confirm_password"
                type="password"
                value={registerConfirmPassword}
                autoComplete="new-password"
                onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                placeholder={t('tenantApp.auth.placeholders.confirmPassword')}
                className={INPUT_CLASS_NAME}
              />
            </div>

            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="h-11 w-full rounded-xl bg-slate-950 text-slate-50 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {t('tenantApp.auth.actions.register')}
            </Button>
          </form>
        )}
      </AnimatedContent>

      <FadeContent blur duration={220} delay={80} className="mt-4 hidden sm:block sm:mt-6">
        <div className="space-y-3">
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            {t('tenantApp.auth.social.comingSoon')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled
              className="h-10 rounded-xl border-slate-300 bg-white/70 text-slate-700 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200"
            >
              {t('tenantApp.auth.social.google')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled
              className="h-10 rounded-xl border-slate-300 bg-white/70 text-slate-700 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200"
            >
              {t('tenantApp.auth.social.github')}
            </Button>
          </div>
        </div>
      </FadeContent>

      {allowTenantSelfService ? (
        <div className="mt-4 flex justify-center sm:mt-5">
          {authMode === 'login' ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              onClick={() => {
                setAuthMode('register')
                clearFeedback()
              }}
            >
              {t('tenantApp.auth.actions.switchToRegister')}
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              onClick={() => {
                setAuthMode('login')
                clearFeedback()
              }}
            >
              {t('tenantApp.auth.actions.switchToLogin')}
            </button>
          )}
        </div>
      ) : null}

      <div className="mt-3 sm:mt-4">{statusNode}</div>
    </div>
  )

  const verifyCard = (
    <div className={CARD_CLASS_NAME}>
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
          {t('tenantApp.auth.brand.badge')}
        </p>
        <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50 sm:text-3xl">
          {t('tenantApp.auth.sections.verifyEmailTitle')}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('tenantApp.auth.sections.verifyEmailSubtitle')}
        </p>
      </div>

      <form className="mt-4 space-y-3.5 sm:mt-6 sm:space-y-4" onSubmit={handleVerifySubmit}>
        <div className="space-y-2">
          <label htmlFor="tenant-verify-email" className={LABEL_CLASS_NAME}>
            {t('tenantApp.auth.fields.email')}
          </label>
          <Input
            id="tenant-verify-email"
            name="email"
            type="email"
            inputMode="email"
            value={verifyForm.email}
            autoComplete="email"
            spellCheck={false}
            onChange={(e) => setVerifyForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder={t('tenantApp.auth.placeholders.email')}
            className={INPUT_CLASS_NAME}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="tenant-verify-code" className={LABEL_CLASS_NAME}>
            {t('tenantApp.auth.fields.verificationCode')}
          </label>
          <Input
            id="tenant-verify-code"
            name="code"
            value={verifyForm.code}
            autoComplete="one-time-code"
            spellCheck={false}
            onChange={(e) => setVerifyForm((prev) => ({ ...prev, code: e.target.value }))}
            placeholder={t('tenantApp.auth.placeholders.verificationCode')}
            className={INPUT_CLASS_NAME}
          />
        </div>
        <Button
          type="submit"
          disabled={verifyMutation.isPending}
          className="h-11 w-full rounded-xl bg-slate-950 text-slate-50 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {t('tenantApp.auth.actions.verifyEmail')}
        </Button>
      </form>

      <div className="mt-4 flex flex-col gap-3 sm:mt-5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {t('tenantApp.auth.notice.verifyCodeHint')}
        </span>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-slate-700 transition hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50"
          onClick={() => openAuthScreen('login')}
        >
          {t('tenantApp.auth.actions.backToLogin')}
        </button>
      </div>

      <div className="mt-3 sm:mt-4">{statusNode}</div>
    </div>
  )

  const forgotCard = (
    <div className={CARD_CLASS_NAME}>
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
          {t('tenantApp.auth.brand.badge')}
        </p>
        <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50 sm:text-3xl">
          {t('tenantApp.auth.sections.forgotPasswordTitle')}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('tenantApp.auth.sections.forgotPasswordSubtitle')}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100/90 p-1 dark:bg-slate-800/80 sm:mt-6">
        <div
          className={`rounded-xl px-2 py-2 text-center text-xs font-semibold ${forgotStep === 'request'
            ? TAB_ACTIVE_CLASS_NAME
            : TAB_INACTIVE_CLASS_NAME}`}
        >
          {t('tenantApp.auth.forgot.stepSendCode')}
        </div>
        <div
          className={`rounded-xl px-2 py-2 text-center text-xs font-semibold ${forgotStep === 'reset'
            ? TAB_ACTIVE_CLASS_NAME
            : TAB_INACTIVE_CLASS_NAME}`}
        >
          {t('tenantApp.auth.forgot.stepResetPassword')}
        </div>
      </div>

      <div className="mt-4 space-y-3.5 sm:mt-6 sm:space-y-4">
        <form className="space-y-3.5 sm:space-y-4" onSubmit={handleForgotRequestSubmit}>
          <div className="space-y-2">
            <label htmlFor="tenant-forgot-email" className={LABEL_CLASS_NAME}>
              {t('tenantApp.auth.fields.email')}
            </label>
            <Input
              id="tenant-forgot-email"
              name="email"
              type="email"
              inputMode="email"
              value={forgotForm.email}
              autoComplete="email"
              spellCheck={false}
              onChange={(e) => setForgotForm({ email: e.target.value })}
              placeholder={t('tenantApp.auth.placeholders.email')}
              className={INPUT_CLASS_NAME}
            />
          </div>
          <Button
            type="submit"
            disabled={forgotMutation.isPending}
            className="h-11 w-full rounded-xl bg-slate-950 text-slate-50 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {t('tenantApp.auth.actions.sendResetCode')}
          </Button>
        </form>

        {forgotStep === 'reset' ? (
          <AnimatedContent
            key="forgot-reset-step"
            reverse
            distance={26}
            duration={0.28}
            ease="power3.out"
            className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-700/70 dark:bg-slate-800/45 sm:p-4"
          >
            <form className="space-y-3.5 sm:space-y-4" onSubmit={handleResetSubmit}>
              <div className="space-y-2">
                <label htmlFor="tenant-reset-code" className={LABEL_CLASS_NAME}>
                  {t('tenantApp.auth.fields.resetCode')}
                </label>
                <Input
                  id="tenant-reset-code"
                  name="code"
                  value={resetForm.code}
                  autoComplete="one-time-code"
                  spellCheck={false}
                  onChange={(e) => setResetForm((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder={t('tenantApp.auth.placeholders.resetCode')}
                  className={INPUT_CLASS_NAME}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="tenant-reset-password" className={LABEL_CLASS_NAME}>
                  {t('tenantApp.auth.fields.newPassword')}
                </label>
                <Input
                  id="tenant-reset-password"
                  name="new_password"
                  type="password"
                  value={resetForm.new_password}
                  autoComplete="new-password"
                  onChange={(e) =>
                    setResetForm((prev) => ({
                      ...prev,
                      new_password: e.target.value,
                    }))
                  }
                  placeholder={t('tenantApp.auth.placeholders.newPassword')}
                  className={INPUT_CLASS_NAME}
                />
              </div>
              <Button
                type="submit"
                disabled={resetMutation.isPending}
                className="h-11 w-full rounded-xl bg-slate-950 text-slate-50 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {t('tenantApp.auth.actions.resetPassword')}
              </Button>
            </form>
          </AnimatedContent>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-3 text-xs text-slate-500 dark:border-slate-700/80 dark:bg-slate-800/35 dark:text-slate-300">
            {t('tenantApp.auth.forgot.drawerHint')}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end sm:mt-5">
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-slate-700 transition hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50"
          onClick={() => openAuthScreen('login')}
        >
          {t('tenantApp.auth.actions.backToLogin')}
        </button>
      </div>

      <div className="mt-3 sm:mt-4">{statusNode}</div>
    </div>
  )

  if (!authChecked) {
    return (
      <div className="min-h-screen p-8 text-sm text-slate-500 dark:text-slate-300">
        {t('tenantApp.loadingPortal')}
      </div>
    )
  }

  if (!authenticated) {
    return (
      <AuthShell
        badge={t('tenantApp.auth.brand.badge')}
        title={t('tenantApp.auth.brand.title')}
        subtitle={t('tenantApp.auth.brand.subtitle')}
        points={tenantBrandPoints}
        rightSlot={
          authScreen === 'auth'
            ? authCard
            : authScreen === 'verify'
              ? verifyCard
              : forgotCard
        }
      />
    )
  }

  const routeFallback = (
    <div className="p-8 text-sm text-slate-500 dark:text-slate-300">
      {t('common.loading')}
    </div>
  )

  return (
    <BrowserRouter basename="/tenant">
      <Routes>
        <Route
          element={
            <AppLayout
              onLogout={handleLogout}
              appName={t('tenantApp.appName')}
              capabilities={capabilities}
              menuGroups={tenantMenuGroups}
              role="tenant"
            />
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={(
              <Suspense fallback={routeFallback}>
                <TenantDashboardPage />
              </Suspense>
            )}
          />
          <Route
            path="/usage"
            element={(
              <Suspense fallback={routeFallback}>
                <TenantUsagePage />
              </Suspense>
            )}
          />
          <Route
            path="/billing"
            element={(
              <Suspense fallback={routeFallback}>
                <TenantBillingPage />
              </Suspense>
            )}
          />
          <Route
            path="/logs"
            element={(
              <Suspense fallback={routeFallback}>
                <TenantLogsPage />
              </Suspense>
            )}
          />
          <Route
            path="/api-keys"
            element={(
              <Suspense fallback={routeFallback}>
                <TenantApiKeysPage />
              </Suspense>
            )}
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

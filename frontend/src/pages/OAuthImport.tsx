import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ExternalLink, Loader2, RefreshCcw, ShieldCheck } from 'lucide-react'

import {
  oauthImportApi,
  type CodexOAuthLoginSession,
  type CodexOAuthLoginSessionStatus,
} from '@/api/oauthImport'
import { extractApiErrorMessage } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { notify } from '@/lib/notification'
import { cn } from '@/lib/utils'

const DEFAULT_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const DEFAULT_PRIORITY = 100

function isTerminalStatus(status?: CodexOAuthLoginSessionStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'expired'
}

function statusBadgeVariant(status?: CodexOAuthLoginSessionStatus) {
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'failed' || status === 'expired') {
    return 'destructive'
  }
  if (status === 'exchanging' || status === 'importing') {
    return 'warning'
  }
  return 'secondary'
}

export default function OAuthImport() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()

  const [label, setLabel] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL)
  const [enabled, setEnabled] = useState(true)
  const [priorityInput, setPriorityInput] = useState(String(DEFAULT_PRIORITY))
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [manualRedirectUrl, setManualRedirectUrl] = useState('')

  const sessionQuery = useQuery({
    queryKey: ['codexOauthLoginSession', sessionId],
    queryFn: () => oauthImportApi.getCodexLoginSession(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) {
        return 2000
      }
      return isTerminalStatus(data.status) ? false : 2000
    },
  })

  const session = sessionQuery.data
  const isBusy = createSessionMutationIsPending(sessionId, session)

  function openAuthorizeTab(authorizeUrl: string) {
    const tab = window.open(authorizeUrl, '_blank', 'noopener,noreferrer')
    if (!tab) {
      notify({
        variant: 'warning',
        title: t('oauthImport.notifications.popupBlockedTitle'),
        description: t('oauthImport.notifications.popupBlockedDescription'),
      })
    }
  }

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const normalizedPriority = Number.parseInt(priorityInput, 10)
      return oauthImportApi.createCodexLoginSession({
        label: label.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
        enabled,
        priority: Number.isFinite(normalizedPriority) ? normalizedPriority : DEFAULT_PRIORITY,
      })
    },
    onSuccess: (created) => {
      setSessionId(created.session_id)
      setManualRedirectUrl('')
      queryClient.setQueryData(['codexOauthLoginSession', created.session_id], created)
      openAuthorizeTab(created.authorize_url)
      notify({
        variant: 'info',
        title: t('oauthImport.notifications.sessionCreatedTitle'),
        description: t('oauthImport.notifications.sessionCreatedDescription'),
      })
    },
    onError: (error: unknown) => {
      notify({
        variant: 'error',
        title: t('oauthImport.notifications.sessionCreateFailedTitle'),
        description:
          extractApiErrorMessage(error) ?? t('oauthImport.notifications.unknownError'),
      })
    },
  })

  const submitManualCallbackMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) {
        throw new Error('session id is missing')
      }
      return oauthImportApi.submitCodexLoginCallback(sessionId, manualRedirectUrl.trim())
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['codexOauthLoginSession', updated.session_id], updated)
      notify({
        variant: updated.status === 'completed' ? 'success' : 'info',
        title: t('oauthImport.notifications.manualSubmitTitle'),
        description:
          updated.status === 'completed'
            ? t('oauthImport.notifications.manualSubmitSuccess')
            : t('oauthImport.notifications.manualSubmitAccepted'),
      })
    },
    onError: (error: unknown) => {
      notify({
        variant: 'error',
        title: t('oauthImport.notifications.manualSubmitFailedTitle'),
        description:
          extractApiErrorMessage(error) ?? t('oauthImport.notifications.unknownError'),
      })
    },
  })

  const showResult = Boolean(session?.result && session.status === 'completed')
  const showError = Boolean(session?.error && (session.status === 'failed' || session.status === 'expired'))

  const statusLabel = useMemo(() => {
    if (!session?.status) {
      return t('oauthImport.status.idle')
    }
    return t(`oauthImport.status.${session.status}`)
  }, [session?.status, t])

  const container = prefersReducedMotion
    ? undefined
    : {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { staggerChildren: 0.08 } },
    }

  const item = prefersReducedMotion
    ? undefined
    : {
      hidden: { opacity: 0, y: 10 },
      show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
    }

  return (
    <motion.div
      variants={container}
      initial={prefersReducedMotion ? undefined : 'hidden'}
      animate={prefersReducedMotion ? undefined : 'show'}
      className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 space-y-6"
    >
      <motion.div variants={item} className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{t('oauthImport.title')}</h2>
        <p className="text-muted-foreground">{t('oauthImport.subtitle')}</p>
      </motion.div>

      <motion.div variants={item}>
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t('oauthImport.start.title')}
            </CardTitle>
            <CardDescription>{t('oauthImport.start.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('oauthImport.form.label')}</label>
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={t('oauthImport.form.labelPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('oauthImport.form.baseUrl')}</label>
                <Input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={DEFAULT_BASE_URL}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('oauthImport.form.priority')}</label>
                <Input
                  value={priorityInput}
                  onChange={(event) => setPriorityInput(event.target.value)}
                  inputMode="numeric"
                  placeholder={String(DEFAULT_PRIORITY)}
                />
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-3">
                <Checkbox
                  id="oauth-import-enabled"
                  checked={enabled}
                  onCheckedChange={(checked) => setEnabled(Boolean(checked))}
                />
                <label htmlFor="oauth-import-enabled" className="text-sm font-medium">
                  {t('oauthImport.form.enabled')}
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={createSessionMutation.isPending}
                onClick={() => createSessionMutation.mutate()}
              >
                {createSessionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                {t('oauthImport.actions.startLogin')}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={!session?.authorize_url}
                onClick={() => {
                  if (session?.authorize_url) {
                    openAuthorizeTab(session.authorize_url)
                  }
                }}
              >
                <RefreshCcw className="h-4 w-4" />
                {t('oauthImport.actions.reopenAuth')}
              </Button>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('oauthImport.status.label')}</span>
                <Badge variant={statusBadgeVariant(session?.status)}>
                  {sessionQuery.isFetching && !isTerminalStatus(session?.status) ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {statusLabel}
                    </span>
                  ) : (
                    statusLabel
                  )}
                </Badge>
                {session?.session_id ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {t('oauthImport.status.sessionId', { id: session.session_id })}
                  </span>
                ) : null}
              </div>
              {session?.callback_url ? (
                <div className="text-xs text-muted-foreground break-all">
                  {t('oauthImport.status.callbackUrl', { url: session.callback_url })}
                </div>
              ) : null}
              {session?.expires_at ? (
                <div className="text-xs text-muted-foreground">
                  {t('oauthImport.status.expiresAt', { time: new Date(session.expires_at).toLocaleString() })}
                </div>
              ) : null}
            </div>

            {showError ? (
              <div
                className={cn(
                  'rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2',
                )}
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <div>{t('oauthImport.error.failed')}</div>
                  <div className="mt-1 text-xs">
                    {session?.error?.code}: {session?.error?.message}
                  </div>
                </div>
              </div>
            ) : null}

            {showResult ? (
              <div className="rounded-md border border-success/30 bg-success-muted px-4 py-3 text-sm text-success-foreground space-y-2">
                <div>{t('oauthImport.result.success')}</div>
                <div className="text-xs text-success-foreground/80 break-all">
                  {t('oauthImport.result.accountId', {
                    id: session?.result?.account.id ?? '-',
                  })}
                </div>
                <div className="text-xs text-success-foreground/80 break-all">
                  {t('oauthImport.result.accountLabel', {
                    label: session?.result?.account.label ?? '-',
                  })}
                </div>
                {session?.result?.email ? (
                  <div className="text-xs text-success-foreground/80">
                    {t('oauthImport.result.email', { email: session.result.email })}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Badge variant={session?.result?.created ? 'success' : 'info'}>
                    {session?.result?.created
                      ? t('oauthImport.result.created')
                      : t('oauthImport.result.updated')}
                  </Badge>
                  <Button type="button" size="xs" variant="outline" onClick={() => navigate('/accounts')}>
                    {t('oauthImport.actions.goAccounts')}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>{t('oauthImport.manual.title')}</CardTitle>
            <CardDescription>{t('oauthImport.manual.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={manualRedirectUrl}
              onChange={(event) => setManualRedirectUrl(event.target.value)}
              placeholder={t('oauthImport.manual.placeholder')}
              rows={4}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!sessionId || submitManualCallbackMutation.isPending || !manualRedirectUrl.trim()}
                onClick={() => submitManualCallbackMutation.mutate()}
              >
                {submitManualCallbackMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t('oauthImport.actions.submitCallback')}
              </Button>
              <span className="text-xs text-muted-foreground">{t('oauthImport.manual.hint')}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {isBusy ? <div className="sr-only">{t('common.loading')}</div> : null}
    </motion.div>
  )
}

function createSessionMutationIsPending(
  sessionId: string | null,
  session?: CodexOAuthLoginSession,
): boolean {
  if (!sessionId) {
    return false
  }
  return !isTerminalStatus(session?.status)
}

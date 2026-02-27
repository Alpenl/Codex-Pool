import { useTranslation } from 'react-i18next'

import type { OAuthAccountStatusResponse, UpstreamAccount } from '@/api/accounts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AccessibleTabList } from '@/components/ui/accessible-tabs'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { AccountDetailTab, RateLimitDisplay } from './types'
import {
  bucketBarClass,
  bucketLabel,
  clampPercent,
  formatAbsoluteDateTime,
  formatRateLimitResetText,
  getModeLabel,
  getRefreshStatusLabel,
} from './utils'

type AccountDetailDialogProps = {
  account: UpstreamAccount | null
  detailTab: AccountDetailTab
  onDetailTabChange: (tab: AccountDetailTab) => void
  onOpenChange: (open: boolean) => void
  isSessionAccount: boolean
  oauthStatus?: OAuthAccountStatusResponse
  oauthStatusLoading: boolean
  rateLimitDisplays: RateLimitDisplay[]
  locale: string
}

export function AccountDetailDialog({
  account,
  detailTab,
  onDetailTabChange,
  onOpenChange,
  isSessionAccount,
  oauthStatus,
  oauthStatusLoading,
  rateLimitDisplays,
  locale,
}: AccountDetailDialogProps) {
  const { t } = useTranslation()
  const fieldLabel = (key: string, defaultValue: string) =>
    t(`accounts.details.fields.${key}`, { defaultValue })

  return (
    <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {account
              ? `${t('accounts.actions.viewDetails', { defaultValue: 'View Details' })} · ${account.label}`
              : t('accounts.actions.viewDetails', { defaultValue: 'View Details' })}
          </DialogTitle>
          <DialogDescription>
            {t('accounts.details.description', {
              defaultValue: 'Description',
            })}
          </DialogDescription>
        </DialogHeader>

        {account ? (
          <div className="space-y-4">
            <AccessibleTabList
              idBase="account-detail"
              ariaLabel={t('accounts.details.tabAria', { defaultValue: 'Account detail tabs' })}
              value={detailTab}
              onValueChange={onDetailTabChange}
              items={[
                {
                  value: 'profile',
                  label: t('accounts.details.tabs.profile', { defaultValue: 'Profile' }),
                },
                {
                  value: 'oauth',
                  label: t('accounts.details.tabs.oauth', { defaultValue: 'OAuth' }),
                },
                {
                  value: 'limits',
                  label: t('accounts.details.tabs.limits', { defaultValue: 'Limits' }),
                },
                {
                  value: 'raw',
                  label: t('accounts.details.tabs.raw', { defaultValue: 'Raw' }),
                },
              ]}
            />

            {detailTab === 'profile' ? (
              <section
                id="account-detail-panel-profile"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby="account-detail-tab-profile"
                className="space-y-3 rounded-lg border p-4"
              >
                <h3 className="text-base font-medium">
                  {t('accounts.details.profileTitle', { defaultValue: 'Profile Title' })}
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('label', 'Label')}
                    </label>
                    <div className="rounded border px-3 py-2 text-sm">{account.label}</div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('mode', 'Mode')}
                    </label>
                    <div className="rounded border px-3 py-2 text-sm">
                      {getModeLabel(account.mode, t)}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('accountId', 'Account ID')}
                    </label>
                    <div className="rounded border px-3 py-2 font-mono text-xs break-all">
                      {account.id}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('enabled', 'Enabled')}
                    </label>
                    <div className="rounded border px-3 py-2 text-sm">
                      <Badge variant={account.enabled ? 'success' : 'warning'}>
                        {account.enabled
                          ? t('accounts.status.active')
                          : t('accounts.status.disabled')}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('baseUrl', 'Base URL')}
                    </label>
                    <div className="rounded border px-3 py-2 font-mono text-xs break-all">
                      {account.base_url}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('chatgptAccountId', 'ChatGPT Account ID')}
                    </label>
                    <div className="rounded border px-3 py-2 font-mono text-xs break-all">
                      {account.chatgpt_account_id ?? '-'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('priority', 'Priority')}
                    </label>
                    <div className="rounded border px-3 py-2 text-sm">{account.priority}</div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('createdAt', 'Created At')}
                    </label>
                    <div className="rounded border px-3 py-2 text-sm">
                      {formatAbsoluteDateTime(account.created_at)}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {fieldLabel('bearerToken', 'Bearer Token')}
                  </label>
                  <div className="max-h-32 overflow-auto rounded border px-3 py-2 font-mono text-xs break-all">
                    {account.bearer_token}
                  </div>
                </div>
              </section>
            ) : null}

            {detailTab === 'oauth' ? (
              <section
                id="account-detail-panel-oauth"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby="account-detail-tab-oauth"
                className="space-y-3 rounded-lg border p-4"
              >
                <h3 className="text-base font-medium">
                  {t('accounts.details.oauthTitle', { defaultValue: 'Oauth Title' })}
                </h3>
                {!isSessionAccount ? (
                  <p className="text-sm text-muted-foreground">
                    {t('accounts.details.oauthNotApplicable', {
                      defaultValue: 'Oauth Not Applicable',
                    })}
                  </p>
                ) : oauthStatusLoading && !oauthStatus ? (
                  <p className="text-sm text-muted-foreground">{t('accounts.oauth.loading')}</p>
                ) : oauthStatus ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('authProvider', 'Auth Provider')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.auth_provider}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('credentialKind', 'Credential Kind')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.credential_kind ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('lastRefreshStatus', 'Last Refresh Status')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {getRefreshStatusLabel(oauthStatus.last_refresh_status, t)}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('effectiveEnabled', 'Effective Enabled')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.effective_enabled ? t('common.yes') : t('common.no')}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('chatgptPlanType', 'ChatGPT Plan Type')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.chatgpt_plan_type ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('sourceType', 'Source Type')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.source_type ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('tokenFamilyId', 'Token Family ID')}
                      </label>
                      <div className="rounded border px-3 py-2 font-mono text-xs break-all">
                        {oauthStatus.token_family_id ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('tokenVersion', 'Token Version')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.token_version ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('tokenExpiresAt', 'Token Expires At')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.token_expires_at ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('nextRefreshAt', 'Next Refresh At')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.next_refresh_at ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('lastRefreshAt', 'Last Refresh At')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.last_refresh_at ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('refreshReusedDetected', 'Refresh Reused Detected')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.refresh_reused_detected ? t('common.yes') : t('common.no')}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('lastRefreshErrorCode', 'Last Refresh Error Code')}
                      </label>
                      <div className="rounded border px-3 py-2 font-mono text-xs break-all">
                        {oauthStatus.last_refresh_error_code ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('lastRefreshError', 'Last Refresh Error')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm break-all">
                        {oauthStatus.last_refresh_error ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('rateLimitsFetchedAt', 'Rate Limits Fetched At')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.rate_limits_fetched_at ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('rateLimitsExpiresAt', 'Rate Limits Expires At')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm">
                        {oauthStatus.rate_limits_expires_at ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('rateLimitsLastErrorCode', 'Rate Limits Last Error Code')}
                      </label>
                      <div className="rounded border px-3 py-2 font-mono text-xs break-all">
                        {oauthStatus.rate_limits_last_error_code ?? '-'}
                      </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        {fieldLabel('rateLimitsLastError', 'Rate Limits Last Error')}
                      </label>
                      <div className="rounded border px-3 py-2 text-sm break-all">
                        {oauthStatus.rate_limits_last_error ?? '-'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('accounts.details.noOauthStatus', { defaultValue: 'No Oauth Status' })}
                  </p>
                )}
              </section>
            ) : null}

            {detailTab === 'limits' ? (
              <section
                id="account-detail-panel-limits"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby="account-detail-tab-limits"
                className="space-y-3 rounded-lg border p-4"
              >
                <h3 className="text-base font-medium">
                  {t('accounts.details.limitsTitle', { defaultValue: 'Limits Title' })}
                </h3>
                {!isSessionAccount ? (
                  <p className="text-sm text-muted-foreground">
                    {t('accounts.details.oauthNotApplicable', {
                      defaultValue: 'Oauth Not Applicable',
                    })}
                  </p>
                ) : rateLimitDisplays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('accounts.rateLimits.unavailable')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {rateLimitDisplays.map((item) => {
                      const remaining = clampPercent(item.remainingPercent)
                      return (
                        <div
                          key={item.bucket}
                          className="rounded-md border border-border/60 bg-muted/20 p-3"
                        >
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium">{bucketLabel(item.bucket, t)}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {t('accounts.rateLimits.remainingPrefix', { defaultValue: 'Remaining' })}{' '}
                              {remaining.toFixed(1)}%
                            </span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted-foreground/20">
                            <div
                              className={cn(
                                'h-full transition-[width] duration-300',
                                bucketBarClass(item.bucket),
                              )}
                              style={{ width: `${remaining}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatRateLimitResetText({
                              resetsAt: item.resetsAt,
                              locale,
                              t,
                            })}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            ) : null}

            {detailTab === 'raw' ? (
              <section
                id="account-detail-panel-raw"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby="account-detail-tab-raw"
                className="space-y-3 rounded-lg border p-4"
              >
                <h3 className="text-base font-medium">
                  {t('accounts.details.rawTitle', { defaultValue: 'Raw Title' })}
                </h3>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('rawAccount', 'Account')}
                    </label>
                    <pre className="max-h-72 overflow-auto rounded border bg-muted/20 p-3 text-xs leading-relaxed">
                      {JSON.stringify(account, null, 2)}
                    </pre>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel('rawOauthStatus', 'OAuth Status')}
                    </label>
                    <pre className="max-h-72 overflow-auto rounded border bg-muted/20 p-3 text-xs leading-relaxed">
                      {JSON.stringify(oauthStatus ?? null, null, 2)}
                    </pre>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

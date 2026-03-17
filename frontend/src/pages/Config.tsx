import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Save, AlertTriangle, Settings2, Globe, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configApi } from '@/api/config'
import type { RuntimeConfigSnapshot, RuntimeConfigUpdateRequest } from '@/api/types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PageIntro,
  PagePanel,
  SectionHeader,
} from '@/components/layout/page-archetypes'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { describeConfigSettingsLayout } from '@/lib/page-archetypes'

export default function Config() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: serverConfig, isLoading } = useQuery({
    queryKey: ['runtimeConfig'],
    queryFn: configApi.getConfig,
  })

  const [formDraft, setFormDraft] = useState<RuntimeConfigSnapshot | null>(null)
  const formState = formDraft ?? serverConfig ?? null

  const updateMutation = useMutation({
    mutationFn: (updated: RuntimeConfigUpdateRequest) => configApi.updateConfig(updated),
    onSuccess: (data) => {
      queryClient.setQueryData(['runtimeConfig'], data)
      setFormDraft(data)
    },
  })

  const updateDraft = (updater: (current: RuntimeConfigSnapshot) => RuntimeConfigSnapshot) => {
    setFormDraft((previous) => {
      const base = previous ?? serverConfig
      if (!base) return previous
      return updater(base)
    })
  }

  const handleSave = () => {
    if (!formState) return
    updateMutation.mutate({
      data_plane_base_url: formState.data_plane_base_url,
      auth_validate_url: formState.auth_validate_url,
      oauth_refresh_enabled: formState.oauth_refresh_enabled,
      oauth_refresh_interval_sec: formState.oauth_refresh_interval_sec,
      notes: formState.notes,
    })
  }
  const configLayout = describeConfigSettingsLayout()

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6 md:space-y-8">
        <PageIntro
          archetype="settings"
          title={t('config.title')}
          description={t('config.subtitle')}
        />

        {configLayout.warningPlacement === 'after-intro' ? (
          <PagePanel tone="secondary" className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-warning-foreground">
                  {t('config.runtimeHint.title')}
                </h2>
                <p className="text-sm leading-6 text-warning-foreground/90">
                  {t('config.runtimeHint.desc')}
                </p>
              </div>
            </div>
          </PagePanel>
        ) : null}

        <div className="relative space-y-6">
          <LoadingOverlay
            show={isLoading}
            title={t('common.loading')}
            size="compact"
          />

          {configLayout.sectionFlow === 'stacked-panels' ? (
            <>
              <PagePanel className="space-y-6">
                <SectionHeader
                  title={(
                    <span className="inline-flex items-center gap-2">
                      <Settings2 className="h-5 w-5 text-muted-foreground" />
                      {t('config.controlPlane.title')}
                    </span>
                  )}
                  description={t('config.controlPlane.desc')}
                />

                <div className="grid gap-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">{t('config.controlPlane.listen')}</label>
                    <Input value={formState?.control_plane_listen ?? ''} disabled />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">{t('config.controlPlane.dataPlaneUrl')}</label>
                    <Input
                      value={formState?.data_plane_base_url ?? ''}
                      onChange={(e) => updateDraft((current) => ({ ...current, data_plane_base_url: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">{t('config.controlPlane.authValidateUrl')}</label>
                    <Input
                      value={formState?.auth_validate_url ?? ''}
                      onChange={(e) => updateDraft((current) => ({ ...current, auth_validate_url: e.target.value }))}
                    />
                  </div>
                </div>
              </PagePanel>

              <PagePanel className="space-y-6">
                <SectionHeader
                  title={(
                    <span className="inline-flex items-center gap-2">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      {t('config.refreshSettings.title')}
                    </span>
                  )}
                  description={t('config.refreshSettings.desc')}
                />

                <div className="grid gap-5">
                  <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium text-foreground">{t('config.refreshSettings.enableLabel')}</label>
                      <p className="text-[13px] leading-6 text-muted-foreground">{t('config.refreshSettings.enableDesc')}</p>
                    </div>
                    <div className="flex items-center sm:justify-end">
                      <Checkbox
                        id="oauth-refresh-toggle"
                        checked={formState?.oauth_refresh_enabled || false}
                        onCheckedChange={(checked) =>
                          updateDraft((current) => ({ ...current, oauth_refresh_enabled: !!checked }))
                        }
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">{t('config.refreshSettings.intervalSec')}</label>
                    <Input
                      type="number"
                      min={1}
                      value={formState?.oauth_refresh_interval_sec ?? 15}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          oauth_refresh_interval_sec: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">{t('config.refreshSettings.notes')}</label>
                    <Input
                      value={formState?.notes ?? ''}
                      onChange={(e) => updateDraft((current) => ({ ...current, notes: e.target.value }))}
                    />
                  </div>
                </div>
              </PagePanel>

              {configLayout.actionPlacement === 'after-sections' ? (
                <PagePanel tone="secondary" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    {updateMutation.isSuccess ? (
                      <span className="inline-flex items-center gap-2 text-sm text-success-foreground">
                        <Save className="h-4 w-4" />
                        {t('config.success')}
                      </span>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('config.subtitle')}
                      </p>
                    )}
                  </div>
                  <Button onClick={handleSave} disabled={isLoading || updateMutation.isPending || !formState}>
                    {updateMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t('config.save')}
                  </Button>
                </PagePanel>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

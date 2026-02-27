import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Save, AlertTriangle, Settings2, Globe, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configApi } from '@/api/config'
import type { RuntimeConfigSnapshot, RuntimeConfigUpdateRequest } from '@/api/types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingOverlay } from '@/components/ui/loading-overlay'

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

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: 'easeOut' as const, duration: 0.3 } } }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex-1 p-8 max-w-4xl overflow-y-auto w-full relative">
      <AnimatePresence>
        {updateMutation.isSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-4 right-8 rounded-md border border-success/30 bg-success-muted px-4 py-2 text-sm font-medium text-success-foreground shadow-sm z-50 flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {t('config.success')}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={item} className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('config.title')}</h2>
          <p className="text-muted-foreground mt-1">{t('config.subtitle')}</p>
        </div>
        <Button className="shadow-sm active:scale-95 transition-[box-shadow,transform]" onClick={handleSave} disabled={isLoading || updateMutation.isPending || !formState}>
          {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t('config.save')}
        </Button>
      </motion.div>

      <motion.div variants={item} className="rounded-lg border border-warning/30 bg-warning-muted p-4 mb-8 flex items-start gap-4 text-warning-foreground shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 bottom-0 w-1 bg-warning" />
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <h4 className="font-semibold text-sm">{t('config.runtimeHint.title')}</h4>
          <p className="text-sm opacity-90 leading-relaxed max-w-2xl mt-1">{t('config.runtimeHint.desc')}</p>
        </div>
      </motion.div>

      <div className="grid gap-6">
        <motion.div variants={item}>
          <Card className="shadow-sm border-border/50 relative overflow-hidden">
            <LoadingOverlay
              show={isLoading}
              title={t('common.loading')}
              size="compact"
            />
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">{t('config.controlPlane.title')}</CardTitle>
                <CardDescription className="mt-1">{t('config.controlPlane.desc')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
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
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="shadow-sm border-border/50 relative overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">{t('config.refreshSettings.title')}</CardTitle>
                <CardDescription className="mt-1">{t('config.refreshSettings.desc')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-foreground">{t('config.refreshSettings.enableLabel')}</label>
                  <p className="text-[13px] text-muted-foreground">{t('config.refreshSettings.enableDesc')}</p>
                </div>
                <div className="sm:max-w-[250px] w-full flex items-center justify-end sm:justify-start pt-1">
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
              <div className="h-px bg-border/40 w-full" />
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
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { tenantKeysApi, type TenantApiKeyRecord } from '@/api/tenantKeys'
import { localizeApiErrorDisplay } from '@/api/errorI18n'
import { notify } from '@/lib/notification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StandardDataTable } from '@/components/ui/standard-data-table'
import { Textarea } from '@/components/ui/textarea'
import { splitAllowlist } from '@/tenant/lib/format'

export function TenantApiKeysPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    ip_allowlist: '',
    model_allowlist: '',
  })

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['tenantKeys', 'manage'],
    queryFn: () => tenantKeysApi.list(),
    staleTime: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      tenantKeysApi.create({
        name: form.name,
        ip_allowlist: splitAllowlist(form.ip_allowlist),
        model_allowlist: splitAllowlist(form.model_allowlist),
      }),
    onSuccess: (response) => {
      notify({
        variant: 'success',
        title: t('tenantApiKeys.messages.createSuccess', { defaultValue: 'Create Success' }),
        description: t('tenantApiKeys.messages.plaintextShownOnce', {
          defaultValue: 'Plaintext Shown Once',
          key: response.plaintext_key,
        }),
      })
      setForm({ name: '', ip_allowlist: '', model_allowlist: '' })
      queryClient.invalidateQueries({ queryKey: ['tenantKeys'] })
    },
    onError: (error) => {
      notify({
        variant: 'error',
        title: t('tenantApiKeys.messages.createFailed', { defaultValue: 'Create Failed' }),
        description: localizeApiErrorDisplay(
          t,
          error,
          t('tenantApiKeys.messages.retryLater', { defaultValue: 'Retry Later' }),
        ).label,
      })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      tenantKeysApi.patch(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantKeys'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantKeysApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenantKeys'] })
    },
  })

  const columns = useMemo<ColumnDef<TenantApiKeyRecord>[]>(
    () => [
      {
        id: 'name',
        header: t('tenantApiKeys.columns.name', { defaultValue: 'Name' }),
        accessorFn: (row) => row.name.toLowerCase(),
        cell: ({ row }) => <span>{row.original.name}</span>,
      },
      {
        id: 'prefix',
        header: t('tenantApiKeys.columns.prefix', { defaultValue: 'Prefix' }),
        accessorFn: (row) => row.key_prefix.toLowerCase(),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.key_prefix}</span>,
      },
      {
        id: 'status',
        header: t('tenantApiKeys.columns.status', { defaultValue: 'Status' }),
        accessorFn: (row) => (row.enabled ? 'enabled' : 'disabled'),
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? 'success' : 'secondary'}>
            {row.original.enabled
              ? t('tenantApiKeys.status.enabled', { defaultValue: 'Enabled' })
              : t('tenantApiKeys.status.disabled', { defaultValue: 'Disabled' })}
          </Badge>
        ),
      },
      {
        id: 'ipAllowlist',
        header: t('tenantApiKeys.columns.ipAllowlist', { defaultValue: 'Ip Allowlist' }),
        accessorFn: (row) => row.ip_allowlist.join(', ').toLowerCase(),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.ip_allowlist.join(', ') || '-'}</span>
        ),
      },
      {
        id: 'modelAllowlist',
        header: t('tenantApiKeys.columns.modelAllowlist', { defaultValue: 'Model Allowlist' }),
        accessorFn: (row) => row.model_allowlist.join(', ').toLowerCase(),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.model_allowlist.join(', ') || '-'}</span>
        ),
      },
      {
        id: 'actions',
        header: t('tenantApiKeys.columns.actions', { defaultValue: 'Actions' }),
        cell: ({ row }) => {
          const key = row.original
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  toggleMutation.mutate({
                    id: key.id,
                    enabled: !key.enabled,
                  })
                }
                disabled={toggleMutation.isPending}
              >
                {key.enabled
                  ? t('tenantApiKeys.actions.disable', { defaultValue: 'Disable' })
                  : t('tenantApiKeys.actions.enable', { defaultValue: 'Enable' })}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate(key.id)}
                disabled={deleteMutation.isPending}
              >
                {t('common.delete')}
              </Button>
            </div>
          )
        },
      },
    ],
    [deleteMutation, t, toggleMutation],
  )

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">{t('nav.apiKeys')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('tenantApiKeys.subtitle', { defaultValue: 'Subtitle' })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('tenantApiKeys.create.title', { defaultValue: 'Title' })}</CardTitle>
          <CardDescription>
            {t('tenantApiKeys.create.description', { defaultValue: 'Description' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              createMutation.mutate()
            }}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Input
                id="tenant-key-name"
                aria-label={t('tenantApiKeys.create.nameAriaLabel', { defaultValue: 'Key name' })}
                placeholder={t('tenantApiKeys.create.namePlaceholder', { defaultValue: 'Name Placeholder' })}
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                autoComplete="off"
              />
              <Textarea
                id="tenant-key-ip-allowlist"
                aria-label={t('tenantApiKeys.create.ipAllowlistAriaLabel', { defaultValue: 'IP allowlist' })}
                placeholder={t('tenantApiKeys.create.ipAllowlistPlaceholder', {
                  defaultValue: 'Ip Allowlist Placeholder',
                })}
                value={form.ip_allowlist}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, ip_allowlist: event.target.value }))
                }
              />
              <Textarea
                id="tenant-key-model-allowlist"
                aria-label={t('tenantApiKeys.create.modelAllowlistAriaLabel', { defaultValue: 'Model allowlist' })}
                placeholder={t('tenantApiKeys.create.modelAllowlistPlaceholder', {
                  defaultValue: 'Model Allowlist Placeholder',
                })}
                value={form.model_allowlist}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, model_allowlist: event.target.value }))
                }
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              {t('tenantApiKeys.create.submit', { defaultValue: 'Submit' })}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('tenantApiKeys.list.title', { defaultValue: 'Title' })}</CardTitle>
          <CardDescription>
            {t('tenantApiKeys.list.description', { defaultValue: 'Description' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <StandardDataTable
              columns={columns}
              data={keys}
              searchPlaceholder={t('tenantApiKeys.list.searchPlaceholder', {
                defaultValue: 'Search by name, prefix, allowlist or status',
              })}
              defaultPageSize={20}
              pageSizeOptions={[20, 50, 100]}
              density="compact"
              emptyText={t('tenantApiKeys.list.empty', { defaultValue: 'No API keys' })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

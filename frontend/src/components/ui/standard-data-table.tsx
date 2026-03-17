import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  Search,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface StandardDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  className?: string
  rowClassName?: string | ((row: TData) => string)
  density?: 'comfortable' | 'compact'
  filters?: ReactNode
  actions?: ReactNode
  defaultPageSize?: number
  pageSizeOptions?: number[]
  searchPlaceholder?: string
  searchFn?: (row: TData, keyword: string) => boolean
  enableSearch?: boolean
  emptyText?: string
  onFilteredDataChange?: (rows: TData[]) => void
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function defaultSearchFn<TData>(row: TData, keyword: string) {
  try {
    return JSON.stringify(row).toLowerCase().includes(keyword)
  } catch {
    return false
  }
}

function sortIndicator(sorted: false | 'asc' | 'desc') {
  if (sorted === 'asc') {
    return <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
  }
  if (sorted === 'desc') {
    return <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
  }
  return <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
}

export function StandardDataTable<TData, TValue>({
  columns,
  data,
  className,
  rowClassName,
  density = 'comfortable',
  filters,
  actions,
  defaultPageSize = 20,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  searchPlaceholder,
  searchFn,
  enableSearch = true,
  emptyText,
  onFilteredDataChange,
}: StandardDataTableProps<TData, TValue>) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const searchInputId = useId()
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  })
  const [jumpTarget, setJumpTarget] = useState('')

  const normalizedKeyword = keyword.trim().toLowerCase()
  const matcher = searchFn ?? defaultSearchFn<TData>

  const filteredData = useMemo(() => {
    if (!enableSearch || !normalizedKeyword) {
      return data
    }
    return data.filter((item) => matcher(item, normalizedKeyword))
  }, [data, enableSearch, matcher, normalizedKeyword])

  useEffect(() => {
    onFilteredDataChange?.(filteredData)
  }, [filteredData, onFilteredDataChange])

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [normalizedKeyword])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredData.length / pagination.pageSize))
    if (pagination.pageIndex >= totalPages) {
      setPagination((prev) => ({ ...prev, pageIndex: totalPages - 1 }))
    }
  }, [filteredData.length, pagination.pageIndex, pagination.pageSize])

  const normalizedPageSizes = useMemo(() => {
    const merged = [...pageSizeOptions, defaultPageSize]
    return Array.from(new Set(merged)).sort((a, b) => a - b)
  }, [defaultPageSize, pageSizeOptions])

  // TanStack Table exposes non-memo-safe methods. This local disable follows upstream guidance.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const rows = table.getRowModel().rows
  const pageCount = Math.max(1, table.getPageCount())
  const totalRows = filteredData.length
  const startRow = totalRows === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const endRow = totalRows === 0 ? 0 : Math.min(totalRows, (pagination.pageIndex + 1) * pagination.pageSize)

  const handleJump = () => {
    const parsed = Number.parseInt(jumpTarget, 10)
    if (Number.isNaN(parsed)) {
      return
    }
    const targetIndex = Math.min(Math.max(parsed, 1), pageCount) - 1
    table.setPageIndex(targetIndex)
    setJumpTarget('')
  }

  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-[1.45rem] border border-border/70 bg-card shadow-[0_18px_40px_rgba(15,23,42,0.06)] dark:border-white/9 dark:shadow-[0_18px_40px_rgba(2,8,16,0.24)]', className)}>
      <div className="flex flex-col gap-3 border-b border-border/70 bg-[linear-gradient(180deg,rgba(242,246,245,0.92),rgba(248,250,250,0.8))] p-3.5 lg:flex-row lg:items-center lg:justify-between dark:bg-[linear-gradient(180deg,rgba(25,34,39,0.88),rgba(21,29,34,0.76))]">
        <div className="flex flex-wrap items-center gap-2 min-w-0">{filters}</div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {actions}
          {enableSearch ? (
            <div className="relative w-full sm:w-[280px]">
              <label htmlFor={searchInputId} className="sr-only">
                {t('common.table.searchLabel')}
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id={searchInputId}
                name="standard_table_search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={searchPlaceholder ?? t('common.table.searchPlaceholder')}
                className="pl-9"
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table
          className={cn(
            'w-full',
            density === 'compact' && '[&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-1.5 [&_td]:text-xs',
          )}
        >
          <TableHeader className="sticky top-0 z-10 bg-[rgba(239,244,243,0.92)] backdrop-blur supports-[backdrop-filter]:bg-[rgba(239,244,243,0.78)] dark:bg-[rgba(31,40,46,0.92)] dark:supports-[backdrop-filter]:bg-[rgba(31,40,46,0.78)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  if (header.isPlaceholder) {
                    return <TableHead key={header.id} />
                  }
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()

                  return (
                    <TableHead key={header.id}>
                      {canSort ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="-ml-2 h-8 px-2 font-medium text-foreground/78 hover:bg-background/75 dark:hover:bg-white/[0.06]"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span>
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </span>
                          {sortIndicator(sorted)}
                        </Button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const resolvedRowClassName =
                typeof rowClassName === 'function'
                  ? rowClassName(row.original)
                  : rowClassName
              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn('border-b border-border/50 hover:bg-primary/[0.045] transition-colors dark:border-white/6 dark:hover:bg-white/[0.035]', resolvedRowClassName)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-10 w-10 opacity-40" />
                    <p className="text-sm font-medium">{emptyText ?? t('common.noData')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/70 bg-[linear-gradient(180deg,rgba(246,248,248,0.92),rgba(251,252,251,0.84))] px-3.5 py-3 text-xs text-muted-foreground xl:flex-row xl:items-center xl:justify-between dark:bg-[linear-gradient(180deg,rgba(22,29,34,0.86),rgba(18,24,29,0.8))]">
        <div className="tabular-nums">
          {t('common.table.range', {
            start: startRow,
            end: endRow,
            total: totalRows,
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <span>{t('common.table.rowsPerPage')}</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger
              className="h-8 w-[92px]"
              size="sm"
              aria-label={t('common.table.rowsPerPage')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {normalizedPageSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="tabular-nums">
            {t('common.table.pageOf', {
              page: pagination.pageIndex + 1,
              total: pageCount,
            })}
          </span>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label={t('common.table.firstPage')}
            >
              <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label={t('common.table.previousPage')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label={t('common.table.nextPage')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
              aria-label={t('common.table.lastPage')}
            >
              <ChevronsRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <span>{t('common.table.jumpToPage')}</span>
            <Input
              value={jumpTarget}
              onChange={(event) => setJumpTarget(event.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleJump()
                }
              }}
              inputMode="numeric"
              className="h-8 w-20"
              placeholder="1"
              aria-label={t('common.table.jumpToPage')}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleJump}
            >
              {t('common.table.go')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

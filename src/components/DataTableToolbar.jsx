'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Shared search + filter + sort bar — mirrors campus-placement-multiuser DataTableToolbar.
 */
export default function DataTableToolbar({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
  filter = '',
  onFilterChange,
  filterOptions = [],
  filterLabel = 'Filter',
  sort = '',
  onSortChange,
  sortOptions = [],
  sortLabel = 'Sort',
  filteredCount,
  totalCount,
  hasActiveFilters = false,
  onClear,
  children,
  className,
}) {
  const showCount = typeof filteredCount === 'number' && typeof totalCount === 'number';

  return (
    <div
      className={cn(
        'bg-card text-card-foreground ring-foreground/10 flex flex-col gap-3 rounded-xl p-4 text-sm shadow-xs ring-1',
        hasActiveFilters && 'ring-primary/25',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        {onSearchChange ? (
          <div className="relative min-w-[200px] flex-1 basis-[220px]">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search table"
            />
          </div>
        ) : null}

        {filterOptions.length > 0 && onFilterChange ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground text-sm font-medium whitespace-nowrap">
              {filterLabel}:
            </span>
            <Select value={filter} onValueChange={onFilterChange}>
              <SelectTrigger className="min-w-[140px]" aria-label={filterLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {filterOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {sortOptions.length > 0 && onSortChange ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground text-sm font-medium whitespace-nowrap">
              {sortLabel}:
            </span>
            <Select value={sort} onValueChange={onSortChange}>
              <SelectTrigger className="min-w-[160px]" aria-label={sortLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sortOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {children}

        {hasActiveFilters && onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-destructive shrink-0 hover:text-destructive"
          >
            <X data-icon="inline-start" />
            Clear
          </Button>
        ) : null}

        {showCount ? (
          <span className="text-muted-foreground ms-auto shrink-0 text-sm font-semibold whitespace-nowrap">
            {filteredCount} of {totalCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}

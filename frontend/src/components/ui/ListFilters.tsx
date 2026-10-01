import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

interface SearchInputProps {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}

/** Search box for list pages (debounce the value before querying the API). */
export function SearchInput({ label, value, placeholder, onChange }: SearchInputProps) {
  return (
    <label className="relative min-w-0 flex-1 basis-60">
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="focus:outline-brand-600 w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm focus:outline-2"
      />
    </label>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}

export function FilterSelect({ label, value, onChange, children }: FilterSelectProps) {
  return (
    <label className="text-sm text-slate-700">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        {children}
      </select>
    </label>
  )
}

interface DateFilterProps {
  label: string
  value: string
  onChange: (value: string) => void
}

/** Date picker for list filters; the value is a "YYYY-MM-DD" string ('' when empty). */
export function DateFilter({ label, value, onChange }: DateFilterProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      />
    </label>
  )
}

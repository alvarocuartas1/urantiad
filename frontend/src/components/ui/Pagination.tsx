import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

interface PaginationProps {
  page: number
  size: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, size, total, onPageChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / size))
  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"
    >
      <p>
        {total} {total === 1 ? 'registro' : 'registros'} · Página {page} de {pages}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          Anterior
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Siguiente
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </nav>
  )
}

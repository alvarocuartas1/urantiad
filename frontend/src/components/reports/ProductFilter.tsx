import { PackageSearch, X } from 'lucide-react'
import { useState } from 'react'
import { ProductPicker } from '@/components/products/ProductPicker'
import { Button } from '@/components/ui/Button'
import type { Product } from '@/types/catalog'

interface ProductFilterProps {
  product: Product | null
  onChange: (product: Product | null) => void
  /** Also offer services (they are sold, not bought). */
  includeServices?: boolean
}

/** Restricts a report to one product: a chip once chosen, the product search meanwhile. */
export function ProductFilter({ product, onChange, includeServices = false }: ProductFilterProps) {
  const [searching, setSearching] = useState(false)

  if (product) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white py-1 pr-1 pl-3 text-sm text-slate-800">
        <PackageSearch aria-hidden="true" className="size-4 text-slate-500" />
        {product.name}
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Quitar el filtro de ${product.name}`}
          className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </span>
    )
  }
  if (!searching) {
    return (
      <Button variant="secondary" onClick={() => setSearching(true)}>
        <PackageSearch aria-hidden="true" className="size-4" />
        Filtrar por producto
      </Button>
    )
  }
  return (
    <div className="flex w-full items-start gap-2 sm:w-[28rem]">
      <div className="min-w-0 flex-1">
        <ProductPicker
          autoFocus
          includeServices={includeServices}
          onSelect={(selected) => {
            onChange(selected)
            setSearching(false)
          }}
        />
      </div>
      <Button variant="ghost" className="mt-7" onClick={() => setSearching(false)}>
        Cancelar
      </Button>
    </div>
  )
}

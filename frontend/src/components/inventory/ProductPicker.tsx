import { LoaderCircle, ScanBarcode } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useProducts } from '@/hooks/useProducts'
import { listProducts } from '@/services/products'
import type { Product } from '@/types/catalog'
import { UNIT_ABBREVIATIONS } from '@/utils/catalog'
import { getErrorMessage } from '@/utils/errors'
import { formatQuantity } from '@/utils/format'

const RESULT_LIMIT = 8

interface ProductPickerProps {
  onSelect: (product: Product) => void
}

/** Exact SKU or barcode match, or the only result: what a barcode scan should pick. */
function pickScanned(products: Product[], term: string): Product | undefined {
  const code = term.toUpperCase()
  const exact = products.find((p) => p.sku === code || p.barcode?.toUpperCase() === code)
  return exact ?? (products.length === 1 ? products[0] : undefined)
}

/**
 * Physical product search by name, SKU or barcode. Pressing Enter (as barcode scanners do)
 * searches immediately and selects the exact match, without waiting for the debounce.
 */
export function ProductPicker({ onSelect }: ProductPickerProps) {
  const inputId = useId()
  const [term, setTerm] = useState('')
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const search = useDebouncedValue(term.trim())
  const { data, isFetching } = useProducts(
    { page: 1, size: RESULT_LIMIT, search, type: 'product', is_active: true },
    { enabled: search.length > 0 },
  )
  const results = search && data ? data.items : []

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    // Keep Enter from submitting the surrounding form.
    event.preventDefault()
    const value = term.trim()
    if (!value) return
    setScanning(true)
    setScanMessage(null)
    try {
      const page = await listProducts({
        page: 1,
        size: RESULT_LIMIT,
        search: value,
        type: 'product',
        is_active: true,
      })
      const product = pickScanned(page.items, value)
      if (product) onSelect(product)
      else if (page.items.length === 0) setScanMessage(`No hay productos activos con "${value}".`)
      else setScanMessage('Varios productos coinciden: seleccione uno de la lista.')
    } catch (error) {
      setScanMessage(getErrorMessage(error))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        Producto
      </label>
      <div className="relative">
        <ScanBarcode
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
        />
        <input
          id={inputId}
          type="search"
          value={term}
          autoComplete="off"
          placeholder="Escanee o busque por nombre, SKU o código de barras…"
          onChange={(event) => {
            setTerm(event.target.value)
            setScanMessage(null)
          }}
          onKeyDown={(event) => void onKeyDown(event)}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-9 pl-9 text-sm focus:outline-2 focus:outline-slate-900"
        />
        {(isFetching || scanning) && (
          <LoaderCircle
            aria-label="Buscando"
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-slate-500"
          />
        )}
      </div>
      {scanMessage && <p className="text-sm text-slate-700">{scanMessage}</p>}
      {results.length > 0 && (
        <ul
          aria-label="Resultados"
          className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200"
        >
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onSelect(product)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-100 focus-visible:outline-none"
              >
                <span>
                  <span className="block font-medium text-slate-900">{product.name}</span>
                  <span className="block text-xs text-slate-500">
                    {product.sku}
                    {product.barcode && ` · ${product.barcode}`}
                  </span>
                </span>
                <span className="text-xs whitespace-nowrap text-slate-600">
                  Stock {formatQuantity(product.current_stock)}{' '}
                  {UNIT_ABBREVIATIONS[product.unit_of_measure]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {search && data && data.items.length === 0 && !scanMessage && (
        <p className="text-sm text-slate-600">No se encontraron productos activos.</p>
      )}
    </div>
  )
}

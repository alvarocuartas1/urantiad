import { Banknote, Eraser, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ProductPicker } from '@/components/products/ProductPicker'
import { CartTable } from '@/components/sales/CartTable'
import { CustomerPickerModal } from '@/components/sales/CustomerPickerModal'
import { PaymentModal } from '@/components/sales/PaymentModal'
import { SaleCompletedModal } from '@/components/sales/SaleCompletedModal'
import { SaleTotals } from '@/components/sales/SaleTotals'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/FormField'
import { useCart } from '@/hooks/useCart'
import { useCurrentCashSession } from '@/hooks/useCash'
import { useCreateSale, usePaymentMethods } from '@/hooks/useSales'
import { getProduct } from '@/services/products'
import type { Sale } from '@/types/sale'
import { fromCents } from '@/utils/decimal'
import { formatDocument } from '@/utils/document'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import { cartTotals, toSaleCreate, type PaymentsFormValues } from '@/utils/sale'

/** Point of sale: scan or search products, charge and start the next sale. */
function PosPage() {
  const { data: session, isPending, isError, error } = useCurrentCashSession()

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Punto de venta</h1>
        {session && (
          <p className="text-sm text-slate-600">
            {session.cash_register.name} · {session.user.full_name}
          </p>
        )}
      </div>
      {isPending && <p className="text-sm text-slate-600">Cargando caja…</p>}
      {isError && <Alert>{getErrorMessage(error)}</Alert>}
      {session === null && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-700">Debe abrir una caja antes de registrar ventas.</p>
          <Link
            to="/caja"
            className="mt-3 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Ir a Mi caja
          </Link>
        </div>
      )}
      {session && <PointOfSale />}
    </section>
  )
}

function PointOfSale() {
  const [cart, dispatch] = useCart()
  const { data: methods, isError: methodsFailed } = usePaymentMethods()
  const mutation = useCreateSale()
  const pickerRef = useRef<HTMLInputElement>(null)
  // Remounting the picker clears its search after each product (and focuses it).
  const [pickerKey, setPickerKey] = useState(0)
  const [paying, setPaying] = useState(false)
  const [choosingCustomer, setChoosingCustomer] = useState(false)
  const [completed, setCompleted] = useState<Sale | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const totals = cartTotals(cart.lines, cart.saleDiscount)
  const canCharge = totals.valid && Boolean(methods?.length) && !completed

  const focusScanner = () => pickerRef.current?.focus()

  const openPayment = () => {
    if (!canCharge) return
    mutation.reset()
    setNotice(null)
    setPaying(true)
  }

  // Keyboard shortcuts of the cashier.
  const shortcuts = useRef({ openPayment, chooseCustomer: () => setChoosingCustomer(true) })
  useEffect(() => {
    shortcuts.current = { openPayment, chooseCustomer: () => setChoosingCustomer(true) }
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault()
        shortcuts.current.openPayment()
      } else if (event.key === 'F4') {
        event.preventDefault()
        shortcuts.current.chooseCustomer()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  /** Reload the cart's products (price, stock) after the server rejected the sale. */
  const refreshCart = async () => {
    try {
      const products = await Promise.all(cart.lines.map((line) => getProduct(line.product.id)))
      dispatch({ type: 'refreshProducts', products })
    } catch {
      // The sale error is already shown; the cart keeps its current values.
    }
  }

  const charge = (payments: PaymentsFormValues['payments']) => {
    if (!methods) return
    const data = toSaleCreate(
      cart.lines,
      totals.saleDiscount,
      cart.customer?.id ?? null,
      payments,
      methods,
    )
    mutation.mutate(data, {
      onSuccess: (sale) => {
        setPaying(false)
        setCompleted(sale)
        dispatch({ type: 'clear' })
      },
      onError: (saleError) => {
        void refreshCart()
        if (isApiErrorCode(saleError, 'PAYMENT_TOTAL_MISMATCH')) {
          // A price changed while the cart was open: show the new total before charging.
          setPaying(false)
          setNotice('Los precios se actualizaron. Revise el total y cobre de nuevo.')
        }
      },
    })
  }

  const startNextSale = () => {
    setCompleted(null)
    setNotice(null)
    setPickerKey((key) => key + 1)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <div className="max-w-xl">
          <ProductPicker
            key={pickerKey}
            autoFocus
            includeServices
            inputRef={pickerRef}
            onSelect={(product) => {
              dispatch({ type: 'add', product })
              setNotice(null)
              setPickerKey((key) => key + 1)
            }}
          />
        </div>
        {notice && <Alert>{notice}</Alert>}
        <CartTable
          lines={cart.lines}
          amounts={totals.lines}
          onQuantityChange={(productId, value) =>
            dispatch({ type: 'setQuantity', productId, value })
          }
          onDiscountChange={(productId, value) =>
            dispatch({ type: 'setDiscount', productId, value })
          }
          onRemove={(productId) => {
            dispatch({ type: 'remove', productId })
            focusScanner()
          }}
          onLineEnter={focusScanner}
        />
      </div>

      <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 lg:self-start">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500">Cliente</p>
            <p className="inline-flex items-center gap-1 font-medium text-slate-900">
              <UserRound aria-hidden="true" className="size-4 text-slate-500" />
              {cart.customer?.name ?? 'Consumidor final'}
            </p>
            {cart.customer && (
              <p className="text-xs text-slate-500">{formatDocument(cart.customer)}</p>
            )}
          </div>
          <Button variant="secondary" onClick={() => setChoosingCustomer(true)}>
            Cambiar (F4)
          </Button>
        </div>

        <TextField
          label="Descuento de la venta"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={cart.saleDiscount}
          error={totals.saleDiscountError}
          hint="En valor; se reparte entre los productos."
          onChange={(event) => dispatch({ type: 'setSaleDiscount', value: event.target.value })}
        />

        <SaleTotals
          totals={{
            subtotal: fromCents(totals.subtotal),
            discount_total: fromCents(totals.discountTotal),
            tax_total: fromCents(totals.taxTotal),
            total: fromCents(totals.total),
          }}
        />

        {methodsFailed && <Alert>No se pudieron cargar los métodos de pago.</Alert>}
        <Button className="w-full py-3 text-base" disabled={!canCharge} onClick={openPayment}>
          <Banknote aria-hidden="true" className="size-5" />
          Cobrar (F2)
        </Button>
        {cart.lines.length > 0 && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              dispatch({ type: 'clear' })
              focusScanner()
            }}
          >
            <Eraser aria-hidden="true" className="size-4" />
            Vaciar venta
          </Button>
        )}
      </aside>

      {paying && methods && (
        <PaymentModal
          total={fromCents(totals.total)}
          methods={methods}
          loading={mutation.isPending}
          error={mutation.isError ? getErrorMessage(mutation.error) : null}
          onSubmit={charge}
          onClose={() => {
            setPaying(false)
            focusScanner()
          }}
        />
      )}
      {choosingCustomer && (
        <CustomerPickerModal
          onSelect={(customer) => {
            dispatch({ type: 'setCustomer', customer })
            setChoosingCustomer(false)
          }}
          onClose={() => setChoosingCustomer(false)}
        />
      )}
      {completed && <SaleCompletedModal sale={completed} onNext={startNextSale} />}
    </div>
  )
}

export default PosPage

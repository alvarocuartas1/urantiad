import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, Save, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { ProductPicker } from '@/components/products/ProductPicker'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/FormField'
import { useAuth } from '@/hooks/useAuth'
import { useCreatePurchase, useUpdatePurchase } from '@/hooks/usePurchases'
import { useSuppliers } from '@/hooks/useSuppliers'
import { listProductSuppliers } from '@/services/suppliers'
import { PERMISSIONS } from '@/types/auth'
import type { Product } from '@/types/catalog'
import type { Purchase } from '@/types/purchase'
import type { SupplierSummary } from '@/types/supplier'
import { getErrorMessage, isApiErrorCode } from '@/utils/errors'
import {
  EMPTY_PURCHASE,
  formTotals,
  newLine,
  purchaseFormSchema,
  suggestUnitCost,
  toPurchaseForm,
  toPurchaseInput,
  type PurchaseFormInput,
  type PurchaseFormValues,
} from '@/utils/purchase'
import { ConfirmPurchaseModal } from './ConfirmPurchaseModal'
import { DiscardPurchaseModal } from './DiscardPurchaseModal'
import { PurchaseLinesEditor } from './PurchaseLinesEditor'
import { PurchaseTotals } from './PurchaseTotals'

/** Active suppliers offered in the selector (a small business has only a few). */
const SUPPLIER_LIMIT = 100

/** API errors shown next to a header field. */
const FIELD_ERRORS: [string, FieldPath<PurchaseFormInput>][] = [
  ['DUPLICATE_SUPPLIER_INVOICE', 'supplier_invoice_number'],
  ['SUPPLIER_INACTIVE', 'supplier_id'],
  ['SUPPLIER_NOT_FOUND', 'supplier_id'],
]

type SaveIntent = 'draft' | 'confirm'

interface PurchaseFormProps {
  /** Draft to edit; omit to register a new purchase. */
  purchase?: Purchase
}

/**
 * Draft editor built for speed: scanning a product adds a line (or focuses the existing one)
 * with the supplier's price, and Enter inside a line goes back to the scanner.
 */
export function PurchaseForm({ purchase }: PurchaseFormProps) {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canReadSuppliers = hasPermission(PERMISSIONS.suppliersRead)
  const createMutation = useCreatePurchase()
  const updateMutation = useUpdatePurchase()
  const mutation = purchase ? updateMutation : createMutation
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Purchase | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const [pickerKey, setPickerKey] = useState(0)
  const pickerRef = useRef<HTMLInputElement>(null)
  const pendingFocus = useRef<FieldPath<PurchaseFormInput> | null>(null)

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setError,
    setFocus,
    reset,
    formState: { errors },
  } = useForm<PurchaseFormInput, unknown, PurchaseFormValues>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: purchase ? toPurchaseForm(purchase) : EMPTY_PURCHASE,
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const [lines, amountPaid] = useWatch({ control, name: ['items', 'amount_paid'] })
  const totals = formTotals(lines, amountPaid)

  const { data: suppliersPage } = useSuppliers({ page: 1, size: SUPPLIER_LIMIT, is_active: true })
  const activeSuppliers: SupplierSummary[] = suppliersPage?.items ?? []
  // A draft keeps its supplier even if it was deactivated afterwards (the API will say so).
  const suppliers =
    purchase && !activeSuppliers.some((s) => s.id === purchase.supplier.id)
      ? [...activeSuppliers, purchase.supplier]
      : activeSuppliers

  // Focus (and select) a line field once the line is rendered.
  useEffect(() => {
    if (!pendingFocus.current) return
    setFocus(pendingFocus.current, { shouldSelect: true })
    pendingFocus.current = null
  }, [fields, setFocus])

  const addProduct = async (product: Product) => {
    setNotice(null)
    setPickerKey((key) => key + 1) // clears the search for the next scan
    const existing = getValues('items').findIndex((line) => line.product.id === product.id)
    if (existing >= 0) {
      setNotice(`${product.name} ya está en la compra: ajuste su cantidad.`)
      setFocus(`items.${existing}.quantity`, { shouldSelect: true })
      return
    }
    const supplierId = Number(getValues('supplier_id')) || null
    const links =
      canReadSuppliers && supplierId ? await listProductSuppliers(product.id).catch(() => []) : []
    pendingFocus.current = `items.${getValues('items').length}.quantity`
    append(newLine(product, suggestUnitCost(links, supplierId, product.last_cost)), {
      shouldFocus: false,
    })
  }

  const onSaved = (saved: Purchase, intent: SaveIntent) => {
    if (intent === 'confirm') {
      setConfirming(saved)
      if (purchase) reset(toPurchaseForm(saved))
    } else if (purchase) {
      reset(toPurchaseForm(saved))
      setNotice('Borrador guardado.')
    } else {
      navigate(`/compras/${saved.id}`, { replace: true })
    }
  }

  const onError = (error: Error) => {
    const field = FIELD_ERRORS.find(([code]) => isApiErrorCode(error, code))?.[1]
    if (field) setError(field, { message: getErrorMessage(error) }, { shouldFocus: true })
  }

  const save = (intent: SaveIntent) =>
    handleSubmit((values) => {
      setNotice(null)
      const data = toPurchaseInput(values)
      const options = { onSuccess: (saved: Purchase) => onSaved(saved, intent), onError }
      if (purchase) updateMutation.mutate({ id: purchase.id, data }, options)
      else createMutation.mutate(data, options)
    })

  // A new purchase exists once saved: leaving the confirmation shows it at its own address.
  const leaveConfirmation = (saved: Purchase) => {
    setConfirming(null)
    if (!purchase) navigate(`/compras/${saved.id}`, { replace: true })
  }

  const fieldErrorShown = FIELD_ERRORS.some(([code]) => isApiErrorCode(mutation.error, code))

  return (
    <form onSubmit={save('draft')} noValidate className="space-y-5">
      {mutation.isError && !fieldErrorShown && <Alert>{getErrorMessage(mutation.error)}</Alert>}
      {notice && (
        <p role="status" className="text-sm text-slate-700">
          {notice}
        </p>
      )}

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Proveedor"
          error={errors.supplier_id?.message}
          {...register('supplier_id')}
        >
          <option value="">Seleccione…</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Factura del proveedor (opcional)"
          autoComplete="off"
          error={errors.supplier_invoice_number?.message}
          {...register('supplier_invoice_number')}
        />
        <TextField
          label="Valor pagado"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          hint="El resto queda como saldo pendiente."
          error={errors.amount_paid?.message}
          {...register('amount_paid')}
        />
        <TextField
          label="Observaciones (opcional)"
          autoComplete="off"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </div>

      <div className="space-y-3">
        <div className="max-w-xl">
          <ProductPicker
            key={pickerKey}
            inputRef={pickerRef}
            onSelect={(product) => void addProduct(product)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Costos sin IVA. Con el proveedor seleccionado se sugiere su último precio.
          </p>
        </div>
        {errors.items?.message && <Alert>{errors.items.message}</Alert>}
        <PurchaseLinesEditor
          fields={fields}
          control={control}
          register={register}
          errors={errors.items}
          onRemove={remove}
          onLineEnter={() => pickerRef.current?.focus()}
        />
      </div>

      <PurchaseTotals totals={totals} />

      <div className="flex flex-wrap justify-end gap-2">
        {purchase && (
          <Button variant="ghost" className="mr-auto" onClick={() => setDiscarding(true)}>
            <Trash2 aria-hidden="true" className="size-4" />
            Descartar borrador
          </Button>
        )}
        <Button type="submit" variant="secondary" loading={mutation.isPending}>
          <Save aria-hidden="true" className="size-4" />
          Guardar borrador
        </Button>
        <Button
          disabled={fields.length === 0 || mutation.isPending}
          onClick={() => void save('confirm')()}
        >
          <CircleCheck aria-hidden="true" className="size-4" />
          Guardar y confirmar
        </Button>
      </div>

      {confirming && (
        <ConfirmPurchaseModal
          purchase={confirming}
          onConfirmed={(confirmed) => {
            setConfirming(null)
            navigate(`/compras/${confirmed.id}`, { replace: true })
          }}
          onClose={() => leaveConfirmation(confirming)}
        />
      )}
      {discarding && purchase && (
        <DiscardPurchaseModal
          purchaseId={purchase.id}
          onDiscarded={() => navigate('/compras', { replace: true })}
          onClose={() => setDiscarding(false)}
        />
      )}
    </form>
  )
}

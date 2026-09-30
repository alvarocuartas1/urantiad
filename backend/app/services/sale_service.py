"""Sales (POS): confirmation and cancellation.

A sale is created already confirmed, in a single transaction: sale + items + payments +
inventory exits + cash movement for its cash part. If anything fails, nothing is saved and
its number is given back.

Lock order, shared by creation and cancellation so they cannot deadlock: sale, cash
session, products (by id), and the sequence last.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, ConflictError, NotFoundError
from app.core.permissions import PermissionCode
from app.models import (
    CashMovementType,
    CashSession,
    CashSessionStatus,
    Customer,
    MovementType,
    PaymentMethod,
    Product,
    ProductType,
    Sale,
    SaleItem,
    SalePayment,
    SaleStatus,
    User,
)
from app.schemas.common import PageParams
from app.schemas.sale import (
    CashSessionSalesSummary,
    PaymentMethodResponse,
    PaymentMethodTotal,
    SaleCancel,
    SaleCreate,
    SaleItemInput,
    SalePaymentInput,
)
from app.services import cash_service, inventory_service, sequence_service
from app.services.cash_service import format_money
from app.services.query import contains_pattern, filter_date_range, paginate

CENT = Decimal("0.01")
HUNDRED = Decimal(100)
ZERO = Decimal("0.00")


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _line_error(index: int, exc: AppError) -> AppError:
    return AppError(f"Línea {index + 1}: {exc.detail}", code=exc.code, status_code=exc.status_code)


def _invalid(detail: str, code: str) -> AppError:
    return AppError(detail, code=code, status_code=422)


# --- Amounts -------------------------------------------------------------------------


def allocate(amount: Decimal, weights: Sequence[Decimal]) -> list[Decimal]:
    """Split `amount` in proportion to `weights`, in whole cents (largest remainder method).

    The shares add up to `amount` exactly and, when `amount <= sum(weights)`, no share is
    larger than its weight.
    """
    cents = int(amount / CENT)
    weight_cents = [int(weight / CENT) for weight in weights]
    total = sum(weight_cents)
    if cents == 0 or total == 0:
        return [ZERO for _ in weights]
    shares = [cents * weight // total for weight in weight_cents]
    remainders = [cents * weight % total for weight in weight_cents]
    leftover = cents - sum(shares)
    for index in sorted(range(len(weights)), key=lambda i: (-remainders[i], i))[:leftover]:
        shares[index] += 1
    return [Decimal(share) * CENT for share in shares]


def included_tax(total: Decimal, tax_rate: Decimal) -> Decimal:
    """Tax included in a price with tax."""
    return _money(total * tax_rate / (HUNDRED + tax_rate))


@dataclass
class _Line:
    product: Product
    quantity: Decimal
    discount: Decimal
    gross: Decimal

    @property
    def net(self) -> Decimal:
        return self.gross - self.discount


def _build_line(index: int, products: dict[int, Product], data: SaleItemInput) -> _Line:
    product = products.get(data.product_id)
    try:
        if product is None:
            raise _invalid("El producto seleccionado no existe.", "PRODUCT_NOT_FOUND")
        if not product.is_active:
            raise _invalid("El producto seleccionado está inactivo.", "PRODUCT_INACTIVE")
        inventory_service.validate_whole_units(product, data.quantity)
        gross = _money(data.quantity * product.sale_price)
        if data.discount > gross:
            raise _invalid(
                f"El descuento no puede superar el valor de la línea ({format_money(gross)}).",
                "LINE_DISCOUNT_EXCEEDS_VALUE",
            )
    except AppError as exc:
        raise _line_error(index, exc) from exc
    return _Line(product, data.quantity, data.discount, gross)


def _build_items(lines: list[_Line], sale_discount: Decimal) -> list[SaleItem]:
    net_total = sum((line.net for line in lines), ZERO)
    if sale_discount > net_total:
        raise _invalid(
            f"El descuento de la venta no puede superar su valor ({format_money(net_total)}).",
            "SALE_DISCOUNT_EXCEEDS_VALUE",
        )
    shares = allocate(sale_discount, [line.net for line in lines])
    items = []
    for line, share in zip(lines, shares, strict=True):
        total = line.net - share
        items.append(
            SaleItem(
                product=line.product,
                quantity=line.quantity,
                unit_price=line.product.sale_price,
                # Exits leave at the average cost; services keep their reference cost.
                unit_cost=line.product.average_cost,
                discount=line.discount,
                sale_discount_share=share,
                tax_rate=line.product.tax_rate,
                tax_amount=included_tax(total, line.product.tax_rate),
                total=total,
            )
        )
    return items


def _build_payments(
    db: Session, payments: list[SalePaymentInput], total: Decimal
) -> list[SalePayment]:
    method_ids = [payment.payment_method_id for payment in payments]
    methods = {
        method.id: method
        for method in db.scalars(select(PaymentMethod).where(PaymentMethod.id.in_(method_ids)))
    }
    result = []
    for data in payments:
        method = methods.get(data.payment_method_id)
        if method is None:
            raise _invalid("El método de pago no existe.", "PAYMENT_METHOD_NOT_FOUND")
        if not method.is_active:
            raise _invalid(
                f"El método de pago {method.name} está inactivo.", "PAYMENT_METHOD_INACTIVE"
            )
        if data.amount_tendered is not None:
            if not method.is_cash:
                raise _invalid(
                    "Solo los pagos en efectivo registran dinero recibido y cambio.",
                    "TENDERED_ONLY_FOR_CASH",
                )
            if data.amount_tendered < data.amount:
                raise _invalid(
                    "El efectivo recibido no alcanza para cubrir el pago en efectivo.",
                    "INSUFFICIENT_TENDERED",
                )
        tendered = data.amount_tendered
        result.append(
            SalePayment(
                payment_method=method,
                amount=data.amount,
                amount_tendered=tendered,
                change_amount=tendered - data.amount if tendered is not None else ZERO,
                reference=data.reference,
            )
        )
    paid = sum((payment.amount for payment in result), ZERO)
    if paid != total:
        raise _invalid(
            f"Los pagos suman {format_money(paid)} y el total de la venta es "
            f"{format_money(total)}.",
            "PAYMENT_TOTAL_MISMATCH",
        )
    return result


def cash_amount(sale: Sale) -> Decimal:
    """Part of the sale paid in cash: what entered the drawer (not what was handed over)."""
    return sum((p.amount for p in sale.payments if p.payment_method.is_cash), ZERO)


# --- Queries -------------------------------------------------------------------------


def _with_details(stmt: Select[tuple[Sale]]) -> Select[tuple[Sale]]:
    return stmt.options(
        selectinload(Sale.customer),
        selectinload(Sale.user),
        selectinload(Sale.cancelled_by),
        selectinload(Sale.cash_session).selectinload(CashSession.cash_register),
        selectinload(Sale.items).selectinload(SaleItem.product),
        selectinload(Sale.payments).selectinload(SalePayment.payment_method),
    )


def _can_read_all(user: User) -> bool:
    return PermissionCode.SALES_READ_ALL in user.permission_codes


def _sale_not_found() -> NotFoundError:
    return NotFoundError("La venta no existe.", code="SALE_NOT_FOUND")


def get_sale(db: Session, actor: User, sale_id: int) -> Sale:
    """A sale visible to `actor`: their own, or any with `sales.read_all` (404 otherwise, so
    other users' sales are not revealed)."""
    sale = db.scalar(_with_details(select(Sale)).where(Sale.id == sale_id))
    if sale is None or (sale.user_id != actor.id and not _can_read_all(actor)):
        raise _sale_not_found()
    return sale


def list_sales(
    db: Session,
    actor: User,
    params: PageParams,
    *,
    search: str | None = None,
    status: SaleStatus | None = None,
    customer_id: int | None = None,
    cash_session_id: int | None = None,
    user_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[Sequence[Sale], int]:
    """Sales, newest first. Without `sales.read_all`, only the actor's."""
    stmt = filter_date_range(select(Sale).join(Sale.customer), Sale.created_at, date_from, date_to)
    if not _can_read_all(actor):
        user_id = actor.id
    if search and search.strip():
        pattern = contains_pattern(search.strip())
        stmt = stmt.where(
            or_(
                Sale.number.ilike(pattern),
                Customer.name.ilike(pattern),
                Customer.document_number.ilike(pattern),
            )
        )
    if status is not None:
        stmt = stmt.where(Sale.status == status)
    if customer_id is not None:
        stmt = stmt.where(Sale.customer_id == customer_id)
    if cash_session_id is not None:
        stmt = stmt.where(Sale.cash_session_id == cash_session_id)
    if user_id is not None:
        stmt = stmt.where(Sale.user_id == user_id)
    stmt = stmt.options(
        selectinload(Sale.customer),
        selectinload(Sale.user),
        selectinload(Sale.cash_session).selectinload(CashSession.cash_register),
    ).order_by(Sale.created_at.desc(), Sale.id.desc())
    return paginate(db, stmt, params)


def list_payment_methods(db: Session) -> Sequence[PaymentMethod]:
    """Active payment methods in display order (a short catalog: not paginated)."""
    return db.scalars(
        select(PaymentMethod)
        .where(PaymentMethod.is_active.is_(True))
        .order_by(PaymentMethod.sort_order, PaymentMethod.id)
    ).all()


def session_sales_summary(db: Session, actor: User, session_id: int) -> CashSessionSalesSummary:
    """Sales of a session visible to `actor` (as in `cash_service.get_session`) and their
    payments by method. A closed session counts the sales it had when it was closed."""
    session = cash_service.get_session(db, actor, session_id)
    counted = Sale.status == SaleStatus.COMPLETED
    if session.closed_at is not None:
        counted = or_(counted, Sale.cancelled_at > session.closed_at)
    sales = select(Sale.id).where(Sale.cash_session_id == session.id, counted)

    sales_count, total_sales = db.execute(
        select(func.count(), func.coalesce(func.sum(Sale.total), ZERO)).where(Sale.id.in_(sales))
    ).one()
    rows = db.execute(
        select(PaymentMethod, func.count(SalePayment.id), func.sum(SalePayment.amount))
        .select_from(SalePayment)
        .join(SalePayment.payment_method)
        .where(SalePayment.sale_id.in_(sales))
        .group_by(PaymentMethod.id)
        .order_by(PaymentMethod.sort_order, PaymentMethod.id)
    ).all()
    return CashSessionSalesSummary(
        sales_count=sales_count,
        total_sales=total_sales,
        by_method=[
            PaymentMethodTotal(
                payment_method=PaymentMethodResponse.model_validate(method),
                payments_count=count,
                total=total,
            )
            for method, count, total in rows
        ],
    )


# --- Creation ------------------------------------------------------------------------


def _sale_customer(db: Session, customer_id: int | None) -> Customer:
    if customer_id is None:
        return db.scalars(select(Customer).where(Customer.is_default)).one()
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise _invalid("El cliente seleccionado no existe.", "CUSTOMER_NOT_FOUND")
    if not customer.is_active:
        raise _invalid("El cliente seleccionado está inactivo.", "CUSTOMER_INACTIVE")
    return customer


def _lock_products(db: Session, product_ids: Sequence[int]) -> dict[int, Product]:
    """Lock the products in id order (so two sales sharing products cannot deadlock)."""
    products = db.scalars(
        select(Product)
        .where(Product.id.in_(product_ids))
        .order_by(Product.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    return {product.id: product for product in products}


def _physical_items(sale: Sale) -> list[SaleItem]:
    """Items that move inventory (services do not), in product id order."""
    items = [item for item in sale.items if item.product.type == ProductType.PRODUCT]
    # `item.product.id`: a new sale's items have no `product_id` until they are flushed.
    return sorted(items, key=lambda item: item.product.id)


def create_sale(db: Session, actor: User, data: SaleCreate) -> Sale:
    """Register a sale in the actor's open cash session, all in one transaction."""
    try:
        session = cash_service.get_open_session_for_user(db, actor, for_update=True)
        if session is None:
            raise ConflictError(
                "Debe abrir una caja antes de registrar ventas.", code="NO_OPEN_CASH_SESSION"
            )
        customer = _sale_customer(db, data.customer_id)
        products = _lock_products(db, [item.product_id for item in data.items])
        lines = [_build_line(i, products, item) for i, item in enumerate(data.items)]
        items = _build_items(lines, data.sale_discount)

        subtotal = sum((line.gross for line in lines), ZERO)
        lines_discount = sum((line.discount for line in lines), ZERO)
        discount_total = lines_discount + data.sale_discount
        total = subtotal - discount_total
        payments = _build_payments(db, data.payments, total)

        # The number is the last query: from here on only in-memory changes until the commit,
        # so no autoflush can insert the sale half built.
        sale = Sale(
            number=sequence_service.next_number(db, sequence_service.SALE_SEQUENCE),
            status=SaleStatus.COMPLETED,
            customer=customer,
            cash_session=session,
            user=actor,
            subtotal=subtotal,
            lines_discount=lines_discount,
            sale_discount=data.sale_discount,
            discount_total=discount_total,
            tax_total=sum((item.tax_amount for item in items), ZERO),
            total=total,
            notes=data.notes,
            items=items,
            payments=payments,
        )
        db.add(sale)
        positions = {item.product_id: index for index, item in enumerate(data.items)}
        for item in _physical_items(sale):
            try:
                inventory_service.record_movement(
                    db, item.product, MovementType.SALE, item.quantity, actor, sale=sale
                )
            except AppError as exc:
                raise _line_error(positions[item.product.id], exc) from exc
        cash = cash_amount(sale)
        if cash > 0:
            cash_service.record_cash_movement(
                db, session, CashMovementType.SALE, cash, actor, f"Venta {sale.number}", sale=sale
            )
        db.commit()
    except AppError:
        db.rollback()
        raise
    return get_sale(db, actor, sale.id)


# --- Cancellation --------------------------------------------------------------------


def _refund_session(db: Session, actor: User, sale: Sale) -> CashSession:
    """Session the cash is given back from: the sale's own if it is still open (the money is
    in that drawer); otherwise the actor's open session."""
    original = db.scalar(
        select(CashSession)
        .where(CashSession.id == sale.cash_session_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if original is not None and original.status == CashSessionStatus.OPEN:
        return original
    own = cash_service.get_open_session_for_user(db, actor, for_update=True)
    if own is None:
        raise ConflictError(
            "La caja de la venta ya está cerrada. Abra una caja para devolver el efectivo.",
            code="CASH_SESSION_REQUIRED",
        )
    return own


def cancel_sale(db: Session, actor: User, sale_id: int, data: SaleCancel) -> Sale:
    """Cancel a sale: its units re-enter at the cost they left with (the last cost is not
    changed) and its cash leaves the drawer. Fails without changes if the drawer does not
    have that cash."""
    try:
        sale = db.scalar(
            _with_details(select(Sale))
            .where(Sale.id == sale_id)
            .with_for_update(of=Sale)
            .execution_options(populate_existing=True)
        )
        if sale is None:
            raise _sale_not_found()
        if sale.status != SaleStatus.COMPLETED:
            raise ConflictError("La venta ya está anulada.", code="SALE_ALREADY_CANCELLED")
        cash = cash_amount(sale)
        session = _refund_session(db, actor, sale) if cash > 0 else None
        items = _physical_items(sale)
        products = _lock_products(db, [item.product_id for item in items])
        for item in items:
            inventory_service.record_movement(
                db,
                products[item.product_id],
                MovementType.SALE_CANCELLATION,
                item.quantity,
                actor,
                unit_cost=item.unit_cost,
                reason=data.reason,
                sale=sale,
            )
        if session is not None:
            cash_service.record_cash_movement(
                db,
                session,
                CashMovementType.SALE_CANCELLATION,
                cash,
                actor,
                f"Anulación de la venta {sale.number}",
                sale=sale,
            )
        sale.status = SaleStatus.CANCELLED
        sale.cancelled_by = actor
        sale.cancelled_at = func.now()
        sale.cancellation_reason = data.reason
        db.commit()
    except AppError:
        db.rollback()
        raise
    return get_sale(db, actor, sale_id)

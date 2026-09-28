import { render, screen } from '@testing-library/react'
import type { StockStatus } from '@/types/catalog'
import { StockStatusBadge } from './StockStatusBadge'

describe('StockStatusBadge', () => {
  it.each<[StockStatus | null, string]>([
    ['ok', 'Stock suficiente'],
    ['low', 'Comprar pronto'],
    ['critical', 'Stock crítico'],
    ['out_of_stock', 'Agotado'],
    [null, 'Servicio'],
  ])('shows %s with text and an icon, not only color', (status, text) => {
    const { container } = render(<StockStatusBadge status={status} />)

    expect(screen.getByText(text)).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('uses different icons for the two red states', () => {
    const critical = render(<StockStatusBadge status="critical" />).container.innerHTML
    const outOfStock = render(<StockStatusBadge status="out_of_stock" />).container.innerHTML

    const iconClass = (html: string) => /lucide-([a-z-]+)/.exec(html)?.[1]
    expect(iconClass(critical)).not.toBe(iconClass(outOfStock))
  })
})

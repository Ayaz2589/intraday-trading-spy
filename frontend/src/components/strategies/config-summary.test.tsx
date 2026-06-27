import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ConfigSummary } from './config-summary'

const HIGHLIGHTS = [
  { label: 'stop buffer (%)', value: '0.2%' },
  { label: 'risk:reward target', value: '2:1 R:R' },
]

describe('ConfigSummary', () => {
  it('renders the one-line summary text', () => {
    render(<ConfigSummary summary="VWAP pullback · 0.2% stop buffer" />)
    expect(screen.getByTestId('config-summary')).toHaveTextContent(
      'VWAP pullback · 0.2% stop buffer',
    )
  })

  it('renders a chip per highlight when chips are requested', () => {
    render(
      <ConfigSummary summary="VWAP pullback · 0.2% stop buffer" highlights={HIGHLIGHTS} chips />,
    )
    expect(screen.getByText('stop buffer (%)')).toBeInTheDocument()
    expect(screen.getByText('0.2%')).toBeInTheDocument()
    expect(screen.getByText('risk:reward target')).toBeInTheDocument()
    expect(screen.getByText('2:1 R:R')).toBeInTheDocument()
  })

  it('still renders the summary line when highlights are empty', () => {
    render(<ConfigSummary summary="VWAP pullback" highlights={[]} chips />)
    expect(screen.getByTestId('config-summary')).toHaveTextContent('VWAP pullback')
  })

  it('renders nothing when there is no summary', () => {
    const { container } = render(<ConfigSummary summary={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the educational help tooltip when requested', () => {
    render(<ConfigSummary summary="VWAP pullback" help />)
    expect(document.querySelector('[data-help-key="config_summary"]')).toBeTruthy()
  })
})

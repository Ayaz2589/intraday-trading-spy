import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/api/strategies', () => ({
  listStrategies: vi.fn().mockResolvedValue({ strategies: [] }),
}))
vi.mock('@/api/configs', () => ({
  listConfigs: vi.fn().mockResolvedValue({ configs: [] }),
  listPresets: vi.fn().mockResolvedValue({ presets: [] }),
  createConfig: vi.fn(),
  duplicateConfig: vi.fn(),
  activateConfig: vi.fn(),
  patchConfig: vi.fn(),
  deleteConfig: vi.fn(),
}))

const { StrategiesPage } = await import('./_authenticated.strategies')

describe('StrategiesPage', () => {
  it('renders the page header, hero, and config workbench', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
    render(
      <QueryClientProvider client={client}>
        <StrategiesPage />
      </QueryClientProvider>,
    )
    expect(screen.getByText('Strategy & configs')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Define the strategy logic once, then tune named risk configs to backtest and compare',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('strategy-hero')).toBeInTheDocument())
    expect(screen.getByTestId('config-manager')).toBeInTheDocument()
  })
})

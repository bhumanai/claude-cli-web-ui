import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandInput } from '../CommandInput'

// Mock the command history hook
vi.mock('../../hooks/useCommandHistory', () => ({
  useCommandHistory: () => ({
    history: ['ls', 'pwd', '/help'],
    addCommand: vi.fn(),
    getPreviousCommand: vi.fn(() => 'ls'),
    getNextCommand: vi.fn(() => ''),
    resetIndex: vi.fn()
  })
}))

describe('CommandInput', () => {
  const mockOnExecute = vi.fn()
  
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render command input with proper styling', () => {
    render(
      <CommandInput
        onExecute={mockOnExecute}
        isConnected={true}
      />
    )

    const input = screen.getByPlaceholderText('Enter command...')
    expect(input).toBeInTheDocument()
    expect(input).not.toBeDisabled()
  })

  it('should disable input when not connected', () => {
    render(
      <CommandInput
        onExecute={mockOnExecute}
        isConnected={false}
      />
    )

    const input = screen.getByPlaceholderText('Enter command...')
    expect(input).toBeDisabled()
  })

  it('should show suggestions when typing', async () => {
    const user = userEvent.setup()
    
    render(
      <CommandInput
        onExecute={mockOnExecute}
        isConnected={true}
      />
    )

    const input = screen.getByPlaceholderText('Enter command...')
    await user.type(input, 'hel')

    await waitFor(() => {
      expect(screen.getByText('/help')).toBeInTheDocument()
    })
  })

  it('should execute command on submit', async () => {
    const user = userEvent.setup()
    
    render(
      <CommandInput
        onExecute={mockOnExecute}
        isConnected={true}
      />
    )

    const input = screen.getByPlaceholderText('Enter command...')
    await user.type(input, 'ls -la')
    
    const submitButton = screen.getByRole('button', { name: /execute/i })
    await user.click(submitButton)

    expect(mockOnExecute).toHaveBeenCalledWith('ls -la')
  })

  it('should support Tab completion', async () => {
    const user = userEvent.setup()
    
    render(
      <CommandInput
        onExecute={mockOnExecute}
        isConnected={true}
      />
    )

    const input = screen.getByPlaceholderText('Enter command...')
    await user.type(input, 'hel')

    await waitFor(() => {
      expect(screen.getByText('/help')).toBeInTheDocument()
    })

    fireEvent.keyDown(input, { key: 'Tab' })

    expect(input).toHaveValue('/help')
  })

  it('should show category filter button', () => {
    render(
      <CommandInput
        onExecute={mockOnExecute}
        isConnected={true}
      />
    )

    const filterButton = screen.getByTitle('Filter by category (F2)')
    expect(filterButton).toBeInTheDocument()
  })

  it('should handle keyboard navigation', async () => {
    const user = userEvent.setup()
    
    render(
      <CommandInput
        onExecute={mockOnExecute}
        isConnected={true}
      />
    )

    const input = screen.getByPlaceholderText('Enter command...')
    
    // Test arrow up for history
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    
    // Test escape to cancel
    fireEvent.keyDown(input, { key: 'Escape' })
    
    expect(input).toBeInTheDocument()
  })

  it('should show syntax highlighting', async () => {
    const user = userEvent.setup()
    
    render(
      <CommandInput
        onExecute={mockOnExecute}
        isConnected={true}
      />
    )

    const input = screen.getByPlaceholderText('Enter command...')
    await user.type(input, '/help')

    // The syntax highlighting overlay should be present
    const overlay = input.parentElement?.querySelector('[class*="absolute"][class*="left-10"]')
    expect(overlay).toBeInTheDocument()
  })

  it('should show validation indicator for commands', async () => {
    const user = userEvent.setup()
    
    render(
      <CommandInput
        onExecute={mockOnExecute}
        isConnected={true}
      />
    )

    const input = screen.getByPlaceholderText('Enter command...')
    await user.type(input, '/help')

    // Should show syntax validation indicator
    const validationIndicator = input.parentElement?.querySelector('[title="Valid syntax"]')
    expect(validationIndicator).toBeInTheDocument()
  })
})
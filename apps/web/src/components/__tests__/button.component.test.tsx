import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '../ui/button'

describe('Button', () => {
  it('renders with label', () => {
    render(<Button>Salvar</Button>)
    expect(screen.getByRole('button', { name: /salvar/i })).toBeTruthy()
  })

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Salvar</Button>)
    expect(screen.getByRole('button', { name: /salvar/i }).hasAttribute('disabled')).toBe(true)
  })
})

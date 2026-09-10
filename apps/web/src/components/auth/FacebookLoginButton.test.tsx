import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FacebookLoginButton } from './FacebookLoginButton';

const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: 'http://localhost:5173/login', origin: 'http://localhost:5173' },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
});

describe('FacebookLoginButton', () => {
  it('navega direto para o endpoint de início do OAuth (não XHR), com origin', async () => {
    render(<FacebookLoginButton />);

    await userEvent.click(screen.getByRole('button', { name: /entrar com facebook/i }));

    expect(window.location.href).toMatch(
      /\/auth\/facebook\/url\?origin=http%3A%2F%2Flocalhost%3A5173$/,
    );
    // navegação direta — nada de XHR
    expect(window.location.href).not.toContain('undefined');
  });

  it('respeita o label customizado', () => {
    render(<FacebookLoginButton label="Cadastrar com Facebook" />);
    expect(screen.getByRole('button', { name: /cadastrar com facebook/i })).toBeInTheDocument();
  });
});

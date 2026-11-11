import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';

describe('Dialog', () => {
  it('conteúdo fica dentro do overlay (tema claro não pinta o fundo)', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Texto</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement?.className).toContain('bg-black/50');
    // todo filho direto do body com o modal contém o role=dialog
    const portals = Array.from(document.body.children).filter((el) => el.querySelector('[class*="bg-black/50"]') || el.className.includes('bg-black/50'));
    expect(portals.length).toBeGreaterThan(0);
    portals.forEach((el) => expect(el.querySelector('[role="dialog"]')).not.toBeNull());
  });
});

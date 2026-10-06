import { render, screen } from '@testing-library/react';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('renders Markdown links safely and strips embedded scripts', () => {
    render(<MarkdownContent markdown={'[Ajuda](https://example.com)\n\n<script>alert(1)</script>'} />);
    const link = screen.getByRole('link', { name: 'Ajuda' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(document.querySelector('script')).toBeNull();
  });
});

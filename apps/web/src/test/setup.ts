import '@testing-library/jest-dom/vitest';

// jsdom não implementa matchMedia por padrão — stub para @tanstack/react-query
// e componentes que o consultam em montagem.
// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
});

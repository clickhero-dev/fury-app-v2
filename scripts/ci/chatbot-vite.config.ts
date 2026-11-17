import base from '../../apps/web/vite.config';

// Never load developer .env files while exercising the isolated chat harness.
export default {
  ...base,
  envDir: false as const,
  cacheDir: process.env.CHAT_E2E_OUTPUT_DIR
    ? `${process.env.CHAT_E2E_OUTPUT_DIR}/vite-cache`
    : 'node_modules/.vite-chatbot-ci',
};

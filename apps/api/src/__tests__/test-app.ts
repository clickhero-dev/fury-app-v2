import app from '../index.js';
import { setStatus } from '../lib/api-state.js';

// Estes testes exercitam rotas após o bootstrap, sem iniciar workers reais.
setStatus('healthy');
export default app;

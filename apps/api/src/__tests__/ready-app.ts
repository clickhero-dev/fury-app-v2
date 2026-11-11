/** Fixtures de rotas exercitam a API depois do bootstrap; testes de startup usam index diretamente. */
import app from '../index.js';
import { setStatus } from '../lib/api-state.js';

setStatus('healthy');
export default app;

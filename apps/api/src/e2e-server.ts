/** Servidor mínimo para E2E: reutiliza o app Express sem iniciar workers. */
import app from './index.js';

const port = Number(process.env.PORT ?? 3100);

app.listen(port, () => {
  console.log(`E2E API listening on http://127.0.0.1:${port}`);
});

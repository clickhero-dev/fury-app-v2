interface CancellableQuery extends PromiseLike<unknown> {
  cancel(): void;
}

/** Limita o probe e solicita cancelamento ao driver quando excede o prazo. */
export async function probeDatabase(start: () => CancellableQuery): Promise<void> {
  const query = start();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      try {
        // postgres.js retorna uma promise de cancelamento apesar do tipo declarar void.
        void Promise.resolve(query.cancel()).catch(() => {});
      } catch { /* O diagnóstico continua sendo timeout. */ }
      reject(Object.assign(new Error('database probe timed out'), { code: 'ETIMEDOUT' }));
    }, 10_000);
  });
  try {
    await Promise.race([query, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

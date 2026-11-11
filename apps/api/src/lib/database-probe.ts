/** Limita o tempo de uma consulta cancelável sem deixar a promise pendente. */
export async function runDatabaseProbe(createQuery: () => PromiseLike<unknown> & { cancel(): unknown }): Promise<void> {
  const query = createQuery();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve(query),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          try { void Promise.resolve(query.cancel()).catch(() => {}); } catch { /* deadline wins */ }
          reject(Object.assign(new Error('database probe timed out'), { code: 'ETIMEDOUT' }));
        }, 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

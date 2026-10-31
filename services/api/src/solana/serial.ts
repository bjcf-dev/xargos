export type Serial = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Runs tasks one at a time, in order. The payer has a single wSOL account: two transactions that
 * create, use and close it at once break each other, so everything that wraps its SOL goes here.
 * One process, so an in-memory queue is enough.
 */
export function createSerial(): Serial {
  let last: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = last.then(task, task);
    last = run.catch(() => {});
    return run;
  };
}

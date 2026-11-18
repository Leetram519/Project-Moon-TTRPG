/**
 * A FIFO per key (on this client only). Tasks with the same key run one at a
 * time in the order they were called.
 *
 * A task that passes the same `owner` as the task holding the key runs right
 * away inside it. Anything else that waits on its own key from inside a task
 * will just never finish.
 */
export function createKeyedQueue() {
  /** @type {Map<string, Promise<void>>} */
  const tails = new Map();
  const holders = new Map();

  return {
    run(key, task, { owner = null } = {}) {
      if (!key) return Promise.resolve().then(task);
      if (owner != null && holders.get(key) === owner) return Promise.resolve().then(task);
      const previous = tails.get(key) ?? Promise.resolve();
      const run = previous.then(async () => {
        holders.set(key, owner);
        try {
          return await task();
        } finally {
          holders.delete(key);
        }
      });
      const tail = run.then(() => undefined, () => undefined);
      tails.set(key, tail);
      tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return run;
    },

    isBusy(key) {
      return tails.has(key);
    },

    holder(key) {
      return holders.get(key) ?? null;
    },
  };
}

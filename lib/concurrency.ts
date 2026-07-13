// Bounded-concurrency runner.
//
// A burst of upstream calls — e.g. per-post insights fanned out across several
// tabs loading at once — can blow past a provider's rate limit or exhaust
// sockets and make a route time out. Routing those calls through a shared
// limiter caps how many run at once globally, so load stays smooth instead of
// spiking. Excess calls queue and run as slots free up (they still complete —
// they're just paced).

export function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const attempt = () => {
        active++;
        fn().then(resolve, reject).finally(() => {
          active--;
          const next = queue.shift();
          if (next) next();
        });
      };
      if (active < max) attempt();
      else queue.push(attempt);
    });
  };
}

// Instagram, Facebook and Ads all hit graph.facebook.com under one app token, so
// they share one rate budget — cap their combined concurrency with a single
// limiter. 10 is comfortable for Meta while still preventing runaway bursts.
export const metaLimiter = createLimiter(10);

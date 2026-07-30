/**
 * Deterministic seeded RNG (mulberry32). Route ALL gameplay randomness through
 * a seeded generator instead of Math.random so the __THREE_GAME_TEST_HOOKS__
 * seed() hook keeps shop rolls, enemy spawns, drops and visual baselines
 * reproducible.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an integer in [0, n) using a seeded generator. */
export function randInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

/** Pick a random element from a non-empty array using a seeded generator. */
export function randPick<T>(rng: () => number, items: readonly T[]): T {
  return items[randInt(rng, items.length)];
}

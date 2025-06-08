const store = new Map();

export const ctx = {
  get: (key) => store.get(key),
  set: (key, value) => store.set(key, value),
  clear: () => store.clear(),
};
// Minimal JSON file store. Fine for a small app on one instance; for scale
// replace with a real database (the interface is get/find/update).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  let data = { users: {} };
  if (path) {
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      // new database
    }
  }
  const persist = () => {
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 1));
    renameSync(tmp, path); // atomic replace
  };
  return {
    get: (id) => data.users[id] ?? null,
    find: (pred) => Object.values(data.users).find(pred) ?? null,
    insert(user) {
      data.users[user.id] = user;
      persist();
      return user;
    },
    update(id, patch) {
      const u = data.users[id];
      if (!u) return null;
      data.users[id] = { ...u, ...patch, updatedAt: Date.now() };
      persist();
      return data.users[id];
    },
  };
}

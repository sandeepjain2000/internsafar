export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function randomPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function referralCodeFrom(nameOrEmail) {
  const base = String(nameOrEmail || 'user')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase() || 'USER';
  return `${base}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

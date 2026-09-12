/** Minimal cookie jar for Node fetch redirect chains. */
export class CookieJar {
  constructor() {
    this.map = new Map();
  }

  absorb(res, baseUrl) {
    const rawList =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : res.headers.get('set-cookie')
          ? [res.headers.get('set-cookie')]
          : [];
    for (const raw of rawList) {
      if (!raw) continue;
      // may be comma-joined for multiple cookies in older runtimes — split carefully
      const parts = String(raw).split(/,(?=\s*[^;=]+=[^;]+)/);
      for (const part of parts) {
        const nv = part.split(';')[0].trim();
        const eq = nv.indexOf('=');
        if (eq <= 0) continue;
        const name = nv.slice(0, eq).trim();
        const value = nv.slice(eq + 1).trim();
        this.map.set(name, value);
      }
    }
    void baseUrl;
  }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

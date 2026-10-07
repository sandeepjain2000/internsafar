/**
 * Lets plain Node scripts import app source that uses the Next.js `@/` alias
 * (jsconfig paths → src/). Call before the first dynamic import of app code.
 *
 *   import { registerAppAlias } from './lib/registerAppAlias.mjs';
 *   registerAppAlias({ stubs: { '@/lib/db': 'data:text/javascript,export async function query(){throw new Error("no db")}' } });
 *   const mail = await import('../src/lib/mail.js');
 *
 * `stubs` replaces specific `@/…` modules (e.g. keep unit tests off the live DB).
 */
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcDir = path.join(appRoot, 'src');
const EXTENSIONS = ['', '.js', '.mjs', '/index.js'];

let registered = false;

function resolveAliasFile(specifier) {
  const rel = specifier.slice(2);
  for (const ext of EXTENSIONS) {
    const file = path.join(srcDir, rel + ext);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

export function registerAppAlias({ stubs = {} } = {}) {
  if (registered) throw new Error('registerAppAlias: already registered');
  registered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (Object.hasOwn(stubs, specifier)) {
        return { url: stubs[specifier], format: 'module', shortCircuit: true };
      }
      if (specifier.startsWith('@/')) {
        const file = resolveAliasFile(specifier);
        if (!file) throw new Error(`registerAppAlias: cannot resolve ${specifier} under src/`);
        return { url: pathToFileURL(file).href, format: 'module', shortCircuit: true };
      }
      const resolved = nextResolve(specifier, context);
      if (resolved.url.startsWith(pathToFileURL(srcDir).href) && resolved.url.endsWith('.js')) {
        return { ...resolved, format: 'module' };
      }
      return resolved;
    },
  });
}

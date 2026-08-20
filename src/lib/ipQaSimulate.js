/** QA-only hooks — no effect unless IP_QA_ROUTES_ENABLED or IP_QA_SIMULATE_LOGIN_DB_FAILURE is set. */

const ARM_KEY = '__ipQaLoginDbFailureArmed';

export function isQaRoutesEnabled() {
  return String(process.env.IP_QA_ROUTES_ENABLED || '').toLowerCase() === 'true';
}

export function armLoginDbFailureOnce() {
  globalThis[ARM_KEY] = true;
}

export function consumeLoginDbFailureSimulation() {
  if (String(process.env.IP_QA_SIMULATE_LOGIN_DB_FAILURE || '').toLowerCase() === 'true') {
    return true;
  }
  if (globalThis[ARM_KEY]) {
    globalThis[ARM_KEY] = false;
    return true;
  }
  return false;
}

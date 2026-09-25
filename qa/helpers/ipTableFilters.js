/**
 * Shared locators for IpTableFiltersShell (collapsible Filters button + panel).
 * Use these after list/browse screens moved off legacy .ip-br-btn / .ip-br-drawer /
 * mobile ip-sheet duplicate filter UIs (applicants, browse, candidates, offers).
 * Button label may include On/Off toggle state (e.g. "Filters Off").
 */
async function openTableFilters(page) {
  const btn = page.locator('button.ip-tf__btn').filter({ hasText: /Filters/i }).first();
  await btn.click();
  const panel = page.locator('.ip-tf__panel');
  return { btn, panel };
}

module.exports = { openTableFilters };

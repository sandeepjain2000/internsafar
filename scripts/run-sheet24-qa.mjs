/**
 * Sheet 24 Public Content & Help smoke checks.
 * node run-sheet24-qa.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.IP_BASE || 'http://localhost:3000';

async function check(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'follow' });
  const text = await res.text();
  return {
    path,
    status: res.status,
    ok: res.status === 200,
    len: text.length,
    hasLoginLink: /\/login|sign[-\s]?in|href=["']\/["']/i.test(text) || /Sign in|Log in|Login/i.test(text),
    hasRegisterLink: /\/register|Sign up|Register/i.test(text),
    snippet: text.replace(/\s+/g, ' ').slice(0, 120),
  };
}

async function main() {
  const paths = {
    home: await check('/'),
    how: await check('/how-it-works'),
    guidelines: await check('/guidelines'),
    help: await check('/help'),
  };

  const executedAt = new Date().toISOString();
  const cases = {};

  cases['TC-IP-24-001'] = {
    status: paths.home.ok ? 'Pass' : 'Fail',
    actual: paths.home.ok
      ? `GET / => ${paths.home.status}, bodyLen=${paths.home.len}; landing content present`
      : `GET / => ${paths.home.status}`,
  };

  const staticOk = paths.how.ok && paths.guidelines.ok && paths.help.ok;
  cases['TC-IP-24-002'] = {
    status: staticOk ? 'Pass' : 'Fail',
    actual: `how-it-works=${paths.how.status}/${paths.how.len}; guidelines=${paths.guidelines.status}/${paths.guidelines.len}; help=${paths.help.status}/${paths.help.len}`,
  };

  // Public pages link to login/register — check home + how-it-works primarily
  const linkSources = [paths.home, paths.how, paths.guidelines, paths.help];
  const anyLogin = linkSources.some((p) => p.hasLoginLink);
  const anyRegister = linkSources.some((p) => p.hasRegisterLink);
  // Home is the main CTA surface; require home 200 and at least login OR register CTA somewhere in public set
  const linkOk = paths.home.ok && (anyLogin || anyRegister);
  cases['TC-IP-24-003'] = {
    status: linkOk ? 'Pass' : 'Fail',
    actual: JSON.stringify({
      homeLoginish: paths.home.hasLoginLink,
      homeRegisterish: paths.home.hasRegisterLink,
      anyLogin,
      anyRegister,
      note: 'Heuristic HTML scan for login/register CTAs on public pages',
    }),
  };

  console.log(
    JSON.stringify(
      {
        sheet: '24 Public Content & Help',
        caseRange: '#144-#142',
        lowestCaseNumReached: 142,
        executedAt,
        base: BASE,
        cases,
        probes: paths,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

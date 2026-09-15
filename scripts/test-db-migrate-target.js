/* eslint-disable no-console */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const {
  isAwsRdsHost,
  assertDbMigrateTargetAllowed,
} = require('./assert-db-migrate-target.js');

let ok = true;
const root = path.join(__dirname, '..');
const rdsUrl = 'postgresql://u:p@prod.xxxx.us-east-1.rds.amazonaws.com:5432/x';

function check(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    ok = false;
  } else {
    console.log('ok:', name);
  }
}

const cases = [
  ['localhost', false],
  ['127.0.0.1', false],
  ['db.example.com', false],
  ['foo.bar.rds.amazonaws.com', true],
  ['x.rds.amazonaws.com.cn', true],
];
for (const [h, exp] of cases) {
  check(`isAwsRdsHost(${h})=${exp}`, isAwsRdsHost(h) === exp);
}

assertDbMigrateTargetAllowed([], {
  connectionString: 'postgresql://u:p@localhost:5432/x',
  forceEc2: false,
  forceVercel: false,
});
check('localhost always allowed', true);

assertDbMigrateTargetAllowed([], {
  connectionString: rdsUrl,
  forceEc2: true,
  forceVercel: false,
});
check('rds allowed on EC2 (in-process)', true);

function childAssert(opts) {
  return spawnSync(
    process.execPath,
    [
      '-e',
      `require('./scripts/assert-db-migrate-target.js').assertDbMigrateTargetAllowed([], ${JSON.stringify(opts)});`,
    ],
    { cwd: root, encoding: 'utf8' }
  );
}

const localBlock = childAssert({
  connectionString: rdsUrl,
  forceEc2: false,
  forceVercel: false,
});
check(
  'rds blocked on local',
  localBlock.status === 1 &&
    /BLOCKED: migrate refused against AWS RDS/.test(localBlock.stderr || '')
);

const vercelBlock = childAssert({
  connectionString: rdsUrl,
  forceEc2: false,
  forceVercel: true,
});
check(
  'rds blocked on Vercel',
  vercelBlock.status === 1 &&
    /BLOCKED: migrate refused against AWS RDS/.test(vercelBlock.stderr || '')
);

const ec2Ok = childAssert({
  connectionString: rdsUrl,
  forceEc2: true,
  forceVercel: false,
});
check('rds allowed on EC2 (child)', ec2Ok.status === 0);

process.exit(ok ? 0 : 1);

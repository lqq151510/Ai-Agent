const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('packaged JRE includes the unsafe compatibility module required by Spring proxies', () => {
  const buildScript = fs.readFileSync(
    path.join(__dirname, '../scripts/build-jre.sh'),
    'utf8',
  );
  const moduleList = buildScript.match(/--add-modules\s+([^\s\\]+)/)?.[1]?.split(',') ?? [];

  assert.ok(
    moduleList.includes('jdk.unsupported'),
    'Spring CGLIB and Objenesis require jdk.unsupported in the packaged JRE',
  );
});

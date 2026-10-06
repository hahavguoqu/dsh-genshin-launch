import test from 'node:test';
import assert from 'node:assert/strict';
import { createLauncher } from '../lib/launcher.js';
import { TASK_LAUNCH_SCRIPT, TASK_NAME } from '../lib/task-script.js';
import { apply } from '../lib/index.js';

const exe = 'E:\\Game Library\\原神\\YuanShen.exe';
test('uses the fixed scheduled task with hidden helper, safe path data and no UAC', async () => {
  let calls = 0;
  const launch = createLauncher(exe, {
    stat: async () => ({ isFile: () => true }), now: () => 1000,
    execFile(file, args, options, callback) {
      calls++; assert.match(file, /WindowsPowerShell/);
      assert.equal(options.windowsHide, true);
      assert.equal(options.env.DSH_GENSHIN_EXECUTABLE, exe);
      assert.equal(options.env.DSH_GENSHIN_TASK, TASK_NAME);
      assert.equal(options.env.DSH_GENSHIN_VALIDATE_ONLY, '0');
      assert.equal(Buffer.from(args.at(-1), 'base64').toString('utf16le'), TASK_LAUNCH_SCRIPT);
      assert.ok(!TASK_LAUNCH_SCRIPT.includes(exe));
      assert.ok(!/RunAs|UseShellExecute|Start-Process/.test(TASK_LAUNCH_SCRIPT));
      queueMicrotask(() => callback(null, '', ''));
    },
  });
  const results = await Promise.all([launch(), launch()]);
  assert.ok(results.every(result => result.ok));
  await launch(); assert.equal(calls, 1);
});
test('missing executable reports an actionable error and allows retry', async () => {
  const launch = createLauncher(exe, { stat: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); } });
  await assert.rejects(launch(), /未找到原神/); await assert.rejects(launch(), /未找到原神/);
});
test('missing task asks for one-time setup instead of silently prompting for UAC', async () => {
  let calls = 0;
  const launch = createLauncher(exe, {
    stat: async () => ({ isFile: () => true }),
    execFile(file, args, options, callback) { calls++; callback(new Error('exit 1'), '', 'TASK_MISSING'); },
  });
  await assert.rejects(launch(), error => error.code === 'TASK_MISSING');
  await assert.rejects(launch(), error => error.code === 'TASK_MISSING');
  assert.equal(calls, 2);
});
test('wrong task configuration and timeout are reported', async () => {
  for (const [stderr, error, message] of [
    ['TASK_MISMATCH', new Error(), /更新启动授权/],
    ['', Object.assign(new Error(), { killed: true }), /响应超时/],
  ]) {
    const launch = createLauncher(exe, {
      stat: async () => ({ isFile: () => true }),
      execFile(file, args, options, callback) { callback(error, '', stderr); },
    });
    await assert.rejects(launch(), message);
  }
});
test('scheduled task definition is validated before its Run call', () => {
  for (const expected of ['Actions.Count -eq 1', 'Triggers.Count -eq 0', '$taskUser -eq $sid',
    'LogonType -eq 3', 'RunLevel -eq 1', 'IsNullOrWhiteSpace($action.Arguments)', '$action.WorkingDirectory']) {
    assert.ok(TASK_LAUNCH_SCRIPT.includes(expected), expected);
  }
  assert.ok(TASK_LAUNCH_SCRIPT.indexOf('TASK_MISMATCH') < TASK_LAUNCH_SCRIPT.indexOf('$task.Run'));
});
test('host blocks GET, unauthenticated POST and cross-site POST', async () => {
  let route, token;
  const ctx = { get: () => undefined, effect: fn => fn(),
    webServer: { register: value => { route = value; return () => {}; } },
  };
  apply({ on(event, fn) { const table = []; fn(table); token = table[0].value; }, inject(keys, fn) { fn(ctx); } }, { executablePath: exe });
  async function request(method, headers) {
    let status;
    await route.handler({ method, headers }, { setHeader() {}, writeHead(code) { status = code; }, end() {} });
    return status;
  }
  assert.equal(await request('GET', {}), 405);
  assert.equal(await request('POST', {}), 403);
  assert.equal(await request('POST', { 'x-dsh-genshin-token': token, 'sec-fetch-site': 'cross-site' }), 403);
});

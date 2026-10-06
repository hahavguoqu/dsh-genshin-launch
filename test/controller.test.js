import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../lib/controller.js';

const game = 'E:\\游戏\\原神\\YuanShen.exe';
function harness(overrides = {}) {
  let prefs = {}, setup = false, launches = 0, website = 0;
  const deps = {
    readPreferences: async () => prefs,
    savePreferences: async (file, path) => { prefs = { executablePath: path }; },
    discoverGame: async options => options.savedPath ? { path: options.savedPath } : null,
    isGameExecutable: async path => path === game,
    pickGame: async () => ({ path: game }),
    setupTask: async () => { setup = true; },
    openWebsite: async () => { website++; },
    createLauncher: () => async () => { if (!setup) throw Object.assign(new Error(), { code: 'TASK_MISSING' }); launches++; return { ok: true }; },
    ...overrides,
  };
  return { controller: createController({}, deps), stats: () => ({ prefs, setup, launches, website }) };
}
test('undetected installation offers selection; only explicit website action opens browser', async () => {
  const { controller, stats } = harness();
  assert.equal((await controller.launch()).state, 'not-found');
  assert.equal(stats().website, 0);
  assert.equal((await controller.website()).state, 'website');
  assert.equal(stats().website, 1);
});
test('selecting game persists path, setup grants one-time task, and next launch reuses it', async () => {
  const { controller, stats } = harness();
  assert.equal((await controller.select()).state, 'needs-setup');
  assert.equal(stats().prefs.executablePath, game);
  assert.equal((await controller.setup()).state, 'launched');
  assert.equal((await controller.launch()).state, 'launched');
  assert.equal(stats().launches, 2);
});
test('automatic detection persists the detected location', async () => {
  const { controller, stats } = harness({ discoverGame: async () => ({ path: game }) });
  assert.equal((await controller.launch()).state, 'needs-setup');
  assert.equal(stats().prefs.executablePath, game);
});
test('canceling selection neither launches nor opens website', async () => {
  const { controller, stats } = harness({ pickGame: async () => ({ canceled: true }) });
  assert.equal((await controller.select()).state, 'not-found');
  assert.equal(stats().launches, 0); assert.equal(stats().website, 0);
});
test('choosing another executable is rejected without saving it', async () => {
  const { controller, stats } = harness({ pickGame: async () => ({ path: 'C:\\Windows\\notepad.exe' }) });
  await assert.rejects(controller.select(), /请选择原神/);
  assert.deepEqual(stats().prefs, {});
});
test('concurrent picker and launch operations cannot spawn multiple dialogs', async () => {
  let release;
  const { controller } = harness({ pickGame: () => new Promise(resolve => { release = resolve; }) });
  const selecting = controller.select();
  await Promise.resolve();
  assert.equal((await controller.launch()).state, 'busy');
  release({ canceled: true }); await selecting;
});

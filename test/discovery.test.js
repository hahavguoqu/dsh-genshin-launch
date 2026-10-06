import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverGame, isGameExecutable } from '../lib/discovery.js';
import { readPreferences, savePreferences } from '../lib/preferences.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fakeDisk(files, configs = {}) {
  return {
    stat: async file => {
      if (files.includes(file)) return { isFile: () => true, size: 10 };
      if (file in configs) return { isFile: () => true, size: configs[file].length };
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    readFile: async file => configs[file],
  };
}
test('saved user path wins; stale saved path falls back to discovery', async () => {
  const file = 'E:\\游戏\\原神\\YuanShen.exe';
  const deps = { ...fakeDisk([file]), probe: async () => ({ roots: ['E:\\游戏\\原神'], drives: [] }) };
  assert.equal((await discoverGame({ savedPath: file }, deps)).source, 'saved');
  assert.equal((await discoverGame({ savedPath: 'C:\\Removed\\YuanShen.exe' }, deps)).path, file);
});
test('detects a launcher on a different drive without any personal fixed path', async () => {
  const file = 'F:\\HoYoPlay\\games\\Genshin Impact Game\\YuanShen.exe';
  const found = await discoverGame({}, { ...fakeDisk([file]), probe: async () => ({ roots: [], drives: ['F:\\'] }) });
  assert.equal(found.path, file);
});
test('launcher configuration resolves a custom game directory', async () => {
  const file = 'E:\\自定义游戏\\YuanShen.exe';
  const found = await discoverGame({}, { ...fakeDisk([file], {
    'C:\\Genshin Impact\\config.ini': '[launcher]\ngame_install_path=E:/自定义游戏\n',
  }), probe: async () => ({ roots: ['C:\\Genshin Impact'], drives: [] }) });
  assert.equal(found.path, file);
});
test('reuses a current-user task path when upgrading', async () => {
  const file = 'Z:\\Games\\原神\\YuanShen.exe';
  const found = await discoverGame({}, { ...fakeDisk([file]), taskPath: async () => file,
    probe: async () => { throw new Error('must not scan when task path is valid'); } });
  assert.equal(found.source, 'scheduled-task');
});
test('no installation returns null, and other exe names are rejected', async () => {
  const deps = { ...fakeDisk([]), probe: async () => ({ roots: [], drives: ['C:\\'] }) };
  assert.equal(await discoverGame({}, deps), null);
  assert.equal(await isGameExecutable('C:\\Windows\\System32\\notepad.exe', deps.stat), false);
  assert.equal(await isGameExecutable('YuanShen.exe', deps.stat), false);
});
test('user preferences survive reload with spaces and Chinese characters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-genshin-test-'));
  try {
    const file = join(directory, 'nested', 'config.json');
    assert.deepEqual(await readPreferences(file), {});
    await savePreferences(file, 'E:\\游戏 文件夹\\YuanShen.exe');
    assert.equal((await readPreferences(file)).executablePath, 'E:\\游戏 文件夹\\YuanShen.exe');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

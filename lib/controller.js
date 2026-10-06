import { readFile, unlink, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { discoverGame, isGameExecutable } from './discovery.js';
import { preferencesPath, readPreferences, savePreferences } from './preferences.js';
import { createLauncher } from './launcher.js';
import { runPowerShell, PICK_GAME_SCRIPT, OPEN_WEBSITE_SCRIPT } from './windows.js';
import { TASK_PATH_SCRIPT, TASK_NAME } from './task-script.js';

export function createController(config = {}, deps = {}) {
  const file = config.preferencesPath || preferencesPath();
  const load = deps.readPreferences ?? readPreferences;
  const save = deps.savePreferences ?? savePreferences;
  const detect = deps.discoverGame ?? discoverGame;
  const check = deps.isGameExecutable ?? isGameExecutable;
  const powershell = deps.runPowerShell ?? runPowerShell;
  const makeLauncher = deps.createLauncher ?? createLauncher;
  let launcher, activePath;
  let operation;
  async function exclusive(action) {
    if (operation) return { ok: false, state: 'busy', message: '正在处理，请稍候' };
    operation = Promise.resolve().then(action);
    try { return await operation; } finally { operation = null; }
  }
  async function resolve() {
    const prefs = await load(file);
    const found = await detect({ savedPath: prefs.executablePath, configuredPath: config.executablePath }, {
      taskPath: async () => JSON.parse(await powershell(TASK_PATH_SCRIPT, { DSH_GENSHIN_TASK: TASK_NAME })).path,
    });
    if (found && found.path !== prefs.executablePath) await save(file, found.path);
    return found;
  }
  async function launchPath(path) {
    if (path !== activePath) { activePath = path; launcher = makeLauncher(path); }
    try { return { ...await launcher(), state: 'launched', path }; }
    catch (error) {
      if (['TASK_MISSING', 'TASK_MISMATCH'].includes(error.code)) {
        return { ok: true, state: 'needs-setup', path, message: '首次设置需确认一次管理员授权，之后即可一键启动。' };
      }
      throw error;
    }
  }
  async function pick() {
    const result = deps.pickGame ? await deps.pickGame() : JSON.parse(await powershell(PICK_GAME_SCRIPT, {}, { timeout: 120000 }));
    if (result.canceled) return { ok: true, state: 'not-found', message: '未选择游戏程序。如果尚未安装，可以前往官网下载。' };
    if (!await check(result.path)) throw new Error('请选择原神游戏目录中的 YuanShen.exe');
    await save(file, result.path);
    return launchPath(result.path);
  }
  return {
    launch: () => exclusive(async () => {
      const found = await resolve();
      return found ? launchPath(found.path) : { ok: true, state: 'not-found', message: '未找到原神。请选择 YuanShen.exe，或前往官网下载。' };
    }),
    select: () => exclusive(pick),
    status: () => exclusive(async () => {
      const found = await resolve();
      return { ok: true, state: found ? 'configured' : 'not-found', path: found?.path,
        message: found ? '已找到原神，可以启动或更换位置。' : '请选择原神程序，或前往官网下载。' };
    }),
    setup: () => exclusive(async () => {
      const found = await resolve();
      if (!found) return { ok: true, state: 'not-found', message: '请先选择原神程序。' };
      if (deps.setupTask) await deps.setupTask(found.path);
      else {
        await mkdir(dirname(file), { recursive: true });
        const resultPath = join(dirname(file), 'setup-' + randomUUID() + '.json');
        const setupPath = fileURLToPath(new URL('../setup-task.ps1', import.meta.url));
        try {
          await powershell('& $env:DSH_GENSHIN_SETUP -ExecutablePath $env:DSH_GENSHIN_EXECUTABLE -ResultPath $env:DSH_GENSHIN_RESULT -PreferencesPath $env:DSH_GENSHIN_PREFERENCES_FILE; if ($LASTEXITCODE) { exit $LASTEXITCODE }',
            { DSH_GENSHIN_SETUP: setupPath, DSH_GENSHIN_EXECUTABLE: found.path, DSH_GENSHIN_RESULT: resultPath, DSH_GENSHIN_PREFERENCES_FILE: file },
            { timeout: 120000, allowLocalScript: true });
          const result = JSON.parse((await readFile(resultPath, 'utf8')).replace(/^\uFEFF/, ''));
          if (!result.ok) throw new Error('Task setup failed');
        } catch (error) {
          let result;
          try { result = JSON.parse((await readFile(resultPath, 'utf8')).replace(/^\uFEFF/, '')); } catch {}
          if (result?.code === 'UAC_CANCELLED') throw new Error('已取消管理员授权，可以稍后重新设置。');
          if (!result?.ok) throw new Error('启动授权设置未完成，请确认权限后重试。');
        } finally { await unlink(resultPath).catch(() => {}); }
      }
      return launchPath(found.path);
    }),
    website: () => exclusive(async () => {
      if (deps.openWebsite) await deps.openWebsite(); else await powershell(OPEN_WEBSITE_SCRIPT);
      return { ok: true, state: 'website', message: '已在默认浏览器打开原神官网。' };
    }),
  };
}

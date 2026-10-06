import { stat } from 'node:fs/promises';
import { isAbsolute, extname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { TASK_LAUNCH_SCRIPT, TASK_NAME } from './task-script.js';

export function createLauncher(executablePath, deps = {}) {
  const execute = deps.execFile ?? execFile;
  const inspect = deps.stat ?? stat;
  const now = deps.now ?? Date.now;
  let pending = false;
  let lastLaunch = -Infinity;
  return async function launch() {
    if (pending || now() - lastLaunch < 3000) return { ok: true, message: '已发送启动请求，请稍候' };
    pending = true;
    try {
      if (!isAbsolute(executablePath) || extname(executablePath).toLowerCase() !== '.exe') {
        throw new Error('请在插件配置中填写原神或米哈游启动器的完整 .exe 路径');
      }
      if (!(await inspect(executablePath)).isFile()) throw new Error('配置的路径不是可执行文件');
      const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      await new Promise((resolve, reject) => {
        execute(powershell, ['-NoProfile', '-NonInteractive', '-Sta', '-EncodedCommand',
          Buffer.from(TASK_LAUNCH_SCRIPT, 'utf16le').toString('base64')], {
          windowsHide: true, timeout: 15000,
          env: { ...process.env, DSH_GENSHIN_EXECUTABLE: executablePath,
            DSH_GENSHIN_TASK: TASK_NAME, DSH_GENSHIN_VALIDATE_ONLY: '0' },
        }, (error, stdout, stderr) => {
          if (!error) return resolve();
          if (/TASK_MISSING/.test(stderr || '')) return reject(Object.assign(new Error('首次启动需要设置免确认启动'), { code: 'TASK_MISSING' }));
          if (/TASK_MISMATCH/.test(stderr || '')) return reject(Object.assign(new Error('需要为当前原神位置更新启动授权'), { code: 'TASK_MISMATCH' }));
          if (error.killed) return reject(new Error('Windows 计划任务响应超时，请稍后重试'));
          reject(new Error('无法运行原神启动任务，请重新运行 setup.cmd 检查权限'));
        });
      });
      lastLaunch = now();
      return { ok: true, message: '已通过免确认任务发送原神启动请求' };
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('未找到原神，请检查插件配置中的 executablePath');
      throw error;
    } finally { pending = false; }
  };
}

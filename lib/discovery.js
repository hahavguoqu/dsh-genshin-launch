import { stat, readFile } from 'node:fs/promises';
import { win32 as path } from 'node:path';
import { runPowerShell, DISCOVERY_SCRIPT } from './windows.js';

export async function isGameExecutable(file, inspect = stat) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.basename(file).toLowerCase() !== 'yuanshen.exe') return false;
  try { return (await inspect(file)).isFile(); } catch { return false; }
}

export async function discoverGame(options = {}, deps = {}) {
  const inspect = deps.stat ?? stat;
  const read = deps.readFile ?? readFile;
  const probe = deps.probe ?? (async () => JSON.parse(await runPowerShell(DISCOVERY_SCRIPT, {}, { timeout: 30000 })));
  for (const file of [options.savedPath, options.configuredPath]) {
    if (await isGameExecutable(file, inspect)) return { path: file, source: file === options.savedPath ? 'saved' : 'configured' };
  }
  // The already-authorized task can preserve the path when upgrading from 1.1.
  const taskPath = await deps.taskPath?.().catch(() => null);
  if (await isGameExecutable(taskPath, inspect)) return { path: taskPath, source: 'scheduled-task' };
  let inventory = { roots: [], drives: [] };
  try { inventory = await probe(); }
  catch {
    // Slow registry/shortcut providers must not hide games on another local drive.
    if (!deps.probe) {
      try {
        inventory.drives = JSON.parse(await runPowerShell("ConvertTo-Json -InputObject @([IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady } | ForEach-Object { $_.RootDirectory.FullName }) -Compress"));
      } catch { /* A restricted host can still offer manual selection. */ }
    }
  }
  const roots = new Set(Array.isArray(inventory.roots) ? inventory.roots : []);
  const drives = Array.isArray(inventory.drives) && inventory.drives.length ? inventory.drives : ['C:\\'];
  const launcherNames = ['miHoYo Launcher', 'HoYoPlay', '米哈游启动器', 'Genshin Impact', '原神'];
  for (const drive of drives) {
    for (const parent of ['', 'Program Files', 'Program Files (x86)', 'Games']) {
      for (const name of launcherNames) roots.add(path.join(drive, parent, name));
    }
  }
  const candidates = new Set();
  for (let root of roots) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) continue;
    if (path.extname(root).toLowerCase() === '.exe') { candidates.add(root); root = path.dirname(root); }
    for (const suffix of ['YuanShen.exe', 'Genshin Impact Game\\YuanShen.exe',
      'games\\Genshin Impact Game\\YuanShen.exe', 'games\\原神\\YuanShen.exe']) candidates.add(path.join(root, suffix));
    try {
      const info = await inspect(path.join(root, 'config.ini'));
      if (info.size > 128 * 1024) continue;
      const ini = await read(path.join(root, 'config.ini'), 'utf8');
      for (const match of ini.matchAll(/^\s*(?:game_install_path|game_installation_path|installation_path|install_path)\s*=\s*(.+?)\s*$/gmi)) {
        const directory = match[1].replace(/^['"]|['"]$/g, '');
        if (path.isAbsolute(directory)) {
          candidates.add(path.join(directory, 'YuanShen.exe'));
          candidates.add(path.join(directory, 'Genshin Impact Game', 'YuanShen.exe'));
        }
      }
    } catch { /* Missing or unreadable optional launcher configuration. */ }
  }
  for (const file of candidates) {
    if (await isGameExecutable(file, inspect)) return { path: file, source: 'detected' };
  }
  return null;
}

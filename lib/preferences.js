import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export function preferencesPath() {
  return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'DSHGenshinLaunch', 'config.json');
}
export async function readPreferences(file) {
  try { return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return {}; throw error; }
}
export async function savePreferences(file, executablePath) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, executablePath }, null, 2) + '\n', 'utf8');
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}

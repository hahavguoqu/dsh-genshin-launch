import { execFile } from 'node:child_process';
import { join } from 'node:path';

export function runPowerShell(script, env = {}, options = {}, execute = execFile) {
  const { allowLocalScript = false, ...processOptions } = options;
  const prelude = "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);\n";
  return new Promise((resolve, reject) => {
    execute(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Sta', ...(allowLocalScript ? ['-ExecutionPolicy', 'Bypass'] : []),
        '-EncodedCommand', Buffer.from(prelude + script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024, ...processOptions, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = String(stderr || '');
          error.message = error.killed ? '等待 Windows 操作超时，请重试' : 'Windows 操作失败，请稍后重试';
          reject(error);
        }
        else resolve(String(stdout || '').replace(/^\uFEFF/, '').trim());
      });
  });
}

export const DISCOVERY_SCRIPT = `
$roots = New-Object 'System.Collections.Generic.List[string]'
$keys = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
foreach ($item in (Get-ItemProperty $keys -ErrorAction SilentlyContinue)) {
  if ($item.DisplayName -match '原神|Genshin|HoYoPlay|miHoYo|米哈游') {
    if ($item.InstallLocation) { $roots.Add([string]$item.InstallLocation) }
    if ($item.DisplayIcon) {
      $icon = ([string]$item.DisplayIcon -replace ',\\s*-?\\d+$', '').Trim('"')
      if ([IO.Path]::IsPathRooted($icon)) { $roots.Add($icon) }
    }
  }
}
$shortcutRoots = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('CommonPrograms'))
$shell = New-Object -ComObject WScript.Shell
foreach ($directory in ($shortcutRoots | Select-Object -Unique)) {
  if (-not $directory) { continue }
  foreach ($link in (Get-ChildItem -LiteralPath $directory -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue)) {
    if ($link.BaseName -match '原神|Genshin|HoYoPlay|miHoYo|米哈游') {
      try { $target = $shell.CreateShortcut($link.FullName).TargetPath; if ($target) { $roots.Add($target) } } catch {}
    }
  }
}
$drives = @([IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady } | ForEach-Object { $_.RootDirectory.FullName })
@{ roots = @($roots | Select-Object -Unique); drives = $drives } | ConvertTo-Json -Compress
`;

export const PICK_GAME_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object Windows.Forms.OpenFileDialog
$dialog.Title = '选择原神游戏程序 YuanShen.exe'
$dialog.Filter = '原神游戏程序 (YuanShen.exe)|YuanShen.exe'
$dialog.CheckFileExists = $true
$dialog.Multiselect = $false
$dialog.RestoreDirectory = $true
$owner = New-Object Windows.Forms.Form
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'
$owner.Show()
try {
  if ($dialog.ShowDialog($owner) -eq [Windows.Forms.DialogResult]::OK) {
    @{ path = $dialog.FileName; canceled = $false } | ConvertTo-Json -Compress
  } else { @{ canceled = $true } | ConvertTo-Json -Compress }
} finally { $dialog.Dispose(); $owner.Dispose() }
`;

export const OPEN_WEBSITE_SCRIPT = `
$info = New-Object Diagnostics.ProcessStartInfo
$info.FileName = 'https://ys.mihoyo.com/'
$info.UseShellExecute = $true
$process = [Diagnostics.Process]::Start($info)
if ($null -ne $process) { $process.Dispose() }
`;

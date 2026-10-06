export const TASK_NAME = 'DeepSeekHarness-GenshinLaunch';

export const TASK_PATH_SCRIPT = `
try {
  $service = New-Object -ComObject 'Schedule.Service'
  $service.Connect()
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $folder = $service.GetFolder('\\')
  $task = $null
  foreach ($taskName in @(($env:DSH_GENSHIN_TASK + '-' + $sid), $env:DSH_GENSHIN_TASK)) {
    try { $task = $folder.GetTask($taskName); break } catch {}
  }
  if ($null -eq $task) { '{}' ; exit 0 }
  $definition = $task.Definition
  $user = $definition.Principal.UserId
  if ($user -notmatch '^S-1-') { $user = (New-Object Security.Principal.NTAccount($user)).Translate([Security.Principal.SecurityIdentifier]).Value }
  if ($user -eq $sid -and $definition.Actions.Count -eq 1) {
    @{ path = $definition.Actions.Item(1).Path } | ConvertTo-Json -Compress
  } else { '{}' }
} catch { '{}' }
`;

// Check the fixed executable, action, user and elevation settings before running.
// Paths and task names are environment data, never interpolated PowerShell code.
export const TASK_LAUNCH_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  $service = New-Object -ComObject 'Schedule.Service'
  $service.Connect()
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $folder = $service.GetFolder('\\')
  $task = $null
  foreach ($taskName in @(($env:DSH_GENSHIN_TASK + '-' + $sid), $env:DSH_GENSHIN_TASK)) {
    try { $task = $folder.GetTask($taskName); break } catch {}
  }
  if ($null -eq $task) { [Console]::Error.WriteLine('TASK_MISSING'); exit 1 }
  $definition = $task.Definition
  $taskUser = $definition.Principal.UserId
  if ($taskUser -notmatch '^S-1-') {
    $taskUser = (New-Object Security.Principal.NTAccount($taskUser)).Translate([Security.Principal.SecurityIdentifier]).Value
  }
  $valid = $definition.Actions.Count -eq 1 -and $definition.Triggers.Count -eq 0 -and
    $taskUser -eq $sid -and $definition.Principal.LogonType -eq 3 -and
    $definition.Principal.RunLevel -eq 1 -and $task.Enabled
  if ($valid) {
    $action = $definition.Actions.Item(1)
    $target = [IO.Path]::GetFullPath($env:DSH_GENSHIN_EXECUTABLE)
    $valid = $action.Type -eq 0 -and [IO.Path]::GetFullPath($action.Path) -ieq $target -and
      [String]::IsNullOrWhiteSpace($action.Arguments) -and
      [IO.Path]::GetFullPath($action.WorkingDirectory) -ieq [IO.Path]::GetDirectoryName($target)
  }
  if (-not $valid) { [Console]::Error.WriteLine('TASK_MISMATCH'); exit 1 }
  if ($env:DSH_GENSHIN_VALIDATE_ONLY -eq '1') { [Console]::WriteLine('TASK_VALID'); exit 0 }
  $null = $task.Run($null)
  exit 0
} catch { [Console]::Error.WriteLine('TASK_FAILED'); exit 1 }
`;

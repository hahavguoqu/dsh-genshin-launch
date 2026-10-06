param(
    [string]$ExecutablePath = '',
    [string]$UserSid = '',
    [string]$ResultPath = '',
    [string]$PreferencesPath = ''
)
$ErrorActionPreference = 'Stop'
$taskName = 'DeepSeekHarness-GenshinLaunch'
$description = 'DeepSeek Harness: launch Genshin on demand (no triggers).'
if (-not $PreferencesPath) { $PreferencesPath = Join-Path $env:LOCALAPPDATA 'DSHGenshinLaunch\config.json' }
if (-not $ResultPath) { $ResultPath = Join-Path (Split-Path -Parent $PreferencesPath) 'setup-result.json' }
$ResultPath = [IO.Path]::GetFullPath($ResultPath)
if (-not $UserSid) { $UserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
$taskName += '-' + $UserSid
function Save-Result($ok, $message, $code = '') {
    [pscustomobject]@{ ok = $ok; message = $message; code = $code; taskName = $taskName; executablePath = $ExecutablePath; userSid = $UserSid } |
        ConvertTo-Json | Set-Content -LiteralPath $ResultPath -Encoding UTF8
}
try {
    $null = New-Object Security.Principal.SecurityIdentifier($UserSid)
    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $ResultPath) -Force
    if (-not $ExecutablePath -and (Test-Path -LiteralPath $PreferencesPath)) {
        $ExecutablePath = (Get-Content -LiteralPath $PreferencesPath -Raw | ConvertFrom-Json).executablePath
    }
    if (-not $ExecutablePath) {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object Windows.Forms.OpenFileDialog
        $dialog.Title = 'Select YuanShen.exe'
        $dialog.Filter = 'Genshin executable (YuanShen.exe)|YuanShen.exe'
        try {
            if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'Selection cancelled.' }
            $ExecutablePath = $dialog.FileName
        } finally { $dialog.Dispose() }
    }
    $ExecutablePath = [IO.Path]::GetFullPath($ExecutablePath)
    if ([IO.Path]::GetFileName($ExecutablePath) -ine 'YuanShen.exe' -or -not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
        throw 'Game executable was not found.'
    }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'),
            '-ExecutablePath', ('"' + $ExecutablePath + '"'), '-UserSid', $UserSid,
            '-ResultPath', ('"' + $ResultPath + '"'), '-PreferencesPath', ('"' + $PreferencesPath + '"'))
        $child = Start-Process -FilePath $powershell -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru -Wait
        if ($child.ExitCode -ne 0) { exit 1 }
        exit 0
    }
    $service = New-Object -ComObject 'Schedule.Service'
    $service.Connect()
    $folder = $service.GetFolder('\')
    $existing = $null
    try { $existing = $folder.GetTask($taskName) } catch {
        $lookupError = $_.Exception
        while ($lookupError.InnerException) { $lookupError = $lookupError.InnerException }
        if ($lookupError.HResult -ne -2147024894) { throw }
    }
    if ($existing -and $existing.Definition.RegistrationInfo.Description -ne $description) {
        throw 'An unrelated task already uses this name; no changes were made.'
    }
    $definition = $service.NewTask(0)
    $definition.RegistrationInfo.Description = $description
    $definition.RegistrationInfo.Author = $UserSid
    $definition.Principal.UserId = $UserSid
    $definition.Principal.LogonType = 3 # Interactive: visible game, no stored password.
    $definition.Principal.RunLevel = 1 # Highest: first-time administrator approval.
    $definition.Settings.Enabled = $true
    $definition.Settings.AllowDemandStart = $true
    $definition.Settings.DisallowStartIfOnBatteries = $false
    $definition.Settings.StopIfGoingOnBatteries = $false
    $definition.Settings.ExecutionTimeLimit = 'PT0S'
    $definition.Settings.MultipleInstances = 2 # IgnoreNew
    $action = $definition.Actions.Create(0)
    $action.Path = $ExecutablePath
    $action.WorkingDirectory = [IO.Path]::GetDirectoryName($ExecutablePath)
    $action.Arguments = ''
    # Administrators/SYSTEM can edit; this user can only read/run when not elevated.
    $security = 'O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;' + $UserSid + ')'
    $null = $folder.RegisterTaskDefinition($taskName, $definition, 22, $UserSid, $null, 3, $security)
    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $PreferencesPath) -Force
    @{ version = 1; executablePath = $ExecutablePath } | ConvertTo-Json | Set-Content -LiteralPath $PreferencesPath -Encoding UTF8
    Save-Result $true 'Scheduled launch is ready. Restart DeepSeek Harness, then click the Genshin button.'
    exit 0
} catch {
    $failure = $_.Exception
    while ($failure.InnerException) { $failure = $failure.InnerException }
    $code = 'TASK_SETUP_FAILED'
    if ($failure -is [ComponentModel.Win32Exception] -and $failure.NativeErrorCode -eq 1223) { $code = 'UAC_CANCELLED' }
    Save-Result $false $failure.Message $code
    exit 1
}

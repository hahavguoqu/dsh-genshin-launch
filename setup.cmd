@echo off
setlocal DisableDelayedExpansion
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-task.ps1"
if errorlevel 1 (
  echo Setup failed or approval was cancelled. See %%LOCALAPPDATA%%\DSHGenshinLaunch\setup-result.json.
) else (
  echo Setup complete. Restart DeepSeek Harness to use the updated plugin.
)
pause

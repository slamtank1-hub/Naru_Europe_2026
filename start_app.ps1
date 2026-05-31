$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = "C:\Users\채수원\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$port = 8766
$url = "http://127.0.0.1:$port/index.html"

if (-not (Test-Path $python)) {
  throw "Python runtime not found: $python"
}

$existing = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*http.server*$port*" -and $_.CommandLine -like "*Naru_Europe_2026*" }

if (-not $existing) {
  Start-Process -FilePath $python -ArgumentList "-m","http.server",$port,"--bind","127.0.0.1" -WorkingDirectory $appDir -WindowStyle Hidden
  Start-Sleep -Seconds 1
}

Start-Process $url

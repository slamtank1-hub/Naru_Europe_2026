$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8766
$url = "http://127.0.0.1:$port/index.html"
$bundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (Test-Path -LiteralPath $bundledPython) {
  $python = $bundledPython
} else {
  $pythonCommand = Get-Command "python" -ErrorAction SilentlyContinue
  if (-not $pythonCommand) {
    throw "Python was not found. Install Python or check PATH."
  }
  $python = $pythonCommand.Source
}

$existing = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*http.server*$port*" -and $_.Name -like "*python*" }

if ($existing) {
  Write-Host "A server is already listening on port $port. If it shows old data, close that server and run this again."
} else {
  Start-Process -FilePath $python -ArgumentList "-m","http.server",$port,"--bind","127.0.0.1" -WorkingDirectory $appDir -WindowStyle Hidden
  Start-Sleep -Seconds 1
}

Start-Process $url

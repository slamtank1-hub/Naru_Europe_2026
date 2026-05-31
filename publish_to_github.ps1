param(
  [string]$GitHubUser = "slamtank1-hub",

  [string]$RepoName = "Naru_Europe_2026",
  [string]$Branch = "main",
  [switch]$Private
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $appDir

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name 명령을 찾을 수 없습니다. 먼저 $name 을 설치하거나 PATH를 확인하세요."
  }
}

Require-Command "git"

$repoFullName = "$GitHubUser/$RepoName"
$remoteUrl = "https://github.com/$repoFullName.git"

if (-not (Test-Path -LiteralPath ".git")) {
  git init -b $Branch
  if ($LASTEXITCODE -ne 0) {
    git init
    git branch -M $Branch
  }
}

if (-not (Test-Path -LiteralPath ".gitignore")) {
  @"
.DS_Store
Thumbs.db
desktop.ini
*.tmp
*.log
"@ | Set-Content -LiteralPath ".gitignore" -Encoding UTF8
}

$currentBranch = (git branch --show-current).Trim()
if (-not $currentBranch) {
  git checkout -b $Branch
} elseif ($currentBranch -ne $Branch) {
  git branch -M $Branch
}

$origin = ""
try {
  $origin = (git remote get-url origin 2>$null).Trim()
} catch {
  $origin = ""
}

if (-not $origin) {
  if (Get-Command "gh" -ErrorAction SilentlyContinue) {
    $visibility = if ($Private) { "--private" } else { "--public" }
    $exists = $true
    try {
      gh repo view $repoFullName *> $null
    } catch {
      $exists = $false
    }

    if (-not $exists) {
      gh repo create $repoFullName $visibility --source "." --remote "origin"
    } else {
      git remote add origin $remoteUrl
    }
  } else {
    git remote add origin $remoteUrl
    Write-Host "GitHub CLI(gh)가 없어 원격만 연결했습니다."
    Write-Host "GitHub에서 $repoFullName 저장소를 먼저 만들어두세요: https://github.com/new"
  }
}

git add .

$stagedChanges = (git diff --cached --name-only)
$hasChanges = ($null -ne $stagedChanges -and $stagedChanges.Count -gt 0)

if ($hasChanges) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  git commit -m "Update Naru Europe 2026 prototype ($timestamp)"
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "커밋에 실패했습니다. Git 사용자 정보가 없을 수 있습니다."
    Write-Host "아래 명령을 한 번만 실행한 뒤 다시 시도하세요."
    Write-Host 'git config --global user.name "Your Name"'
    Write-Host 'git config --global user.email "you@example.com"'
    exit 1
  }
} else {
  Write-Host "커밋할 변경사항이 없습니다."
}

$head = ""
try {
  $head = (git rev-parse --verify HEAD 2>$null).Trim()
} catch {
  $head = ""
}

if (-not $head) {
  Write-Host "아직 커밋이 없어 push할 수 없습니다."
  Write-Host "파일이 git add 대상인지 확인한 뒤 다시 실행하세요."
  exit 1
}

git push -u origin $Branch

Write-Host ""
Write-Host "업로드 완료:"
Write-Host "https://github.com/$repoFullName"

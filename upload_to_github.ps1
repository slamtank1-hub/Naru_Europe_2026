param(
  [string]$Message = "",
  [string]$Branch = "main",
  [string]$RepoUrl = "https://github.com/slamtank1-hub/Naru_Europe_2026.git",
  [string]$GitName = "slamtank1-hub",
  [string]$GitEmail = "slamtank1-hub@users.noreply.github.com"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectDir

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name 명령을 찾을 수 없습니다. 설치 상태나 PATH를 확인하세요."
  }
}

function Run-Git {
  & git @args
  if ($LASTEXITCODE -ne 0) {
    throw "git $($args -join ' ') 실행에 실패했습니다."
  }
}

Require-Command "git"

Write-Host "프로젝트 폴더: $ProjectDir"

if (-not (Test-Path -LiteralPath ".git")) {
  throw "Git 저장소가 아닙니다. 먼저 git init 또는 기존 저장소 연결을 확인하세요."
}

$origin = ""
try {
  $origin = (& git remote get-url origin 2>$null).Trim()
} catch {
  $origin = ""
}

if (-not $origin) {
  Run-Git remote add origin $RepoUrl
  $origin = $RepoUrl
} elseif ($origin -ne $RepoUrl) {
  Write-Host "origin 주소를 지정한 GitHub 저장소로 변경합니다."
  Write-Host "기존: $origin"
  Write-Host "변경: $RepoUrl"
  Run-Git remote set-url origin $RepoUrl
  $origin = $RepoUrl
}

Write-Host "GitHub 원격: $origin"
Write-Host "커밋 작성자: $GitName <$GitEmail>"

$env:GIT_AUTHOR_NAME = $GitName
$env:GIT_AUTHOR_EMAIL = $GitEmail
$env:GIT_COMMITTER_NAME = $GitName
$env:GIT_COMMITTER_EMAIL = $GitEmail

$currentBranch = (& git branch --show-current).Trim()
if (-not $currentBranch) {
  Run-Git checkout -b $Branch
} elseif ($currentBranch -ne $Branch) {
  Write-Host "현재 브랜치가 '$currentBranch'입니다. '$Branch' 브랜치로 전환합니다."
  Run-Git checkout $Branch
}

Run-Git add -A

$staged = @(& git diff --cached --name-only)
if ($staged.Count -eq 0) {
  Write-Host "커밋할 변경사항이 없습니다. 그래도 최신 브랜치를 push합니다."
} else {
  if (-not $Message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "Update Naru Europe 2026 ($timestamp)"
  }

  Write-Host "커밋 메시지: $Message"
  & git commit -m $Message
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "커밋에 실패했습니다. 다른 Git 오류가 있는지 위 메시지를 확인하세요."
    exit 1
  }
}

Run-Git push -u origin $Branch

Write-Host ""
Write-Host "GitHub 업로드 완료"
Write-Host $origin.Replace(".git", "")

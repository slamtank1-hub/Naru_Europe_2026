param(
  [string]$ProjectDir = "",
  [string]$GitHubUser = "slamtank1-hub",
  [string]$RepoName = "Naru_Europe_2026",
  [string]$Branch = "main",
  [string]$Message = "",
  [switch]$Private
)

if (-not $ProjectDir) {
  $ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$ProjectDir = $ProjectDir.Trim().Trim('"')

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ProjectDir)) {
  throw "Project folder was not found: $ProjectDir"
}

Set-Location -LiteralPath $ProjectDir
Write-Host "Current folder: $ProjectDir"

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name command was not found. Install it first or check PATH."
  }
}

function Run-Git {
  & git @args
  if ($LASTEXITCODE -ne 0) {
    throw "git $($args -join ' ') failed."
  }
}

Require-Command "git"

$repoFullName = "$GitHubUser/$RepoName"
$remoteUrl = "https://github.com/$repoFullName.git"

if (-not (Test-Path -LiteralPath ".git")) {
  Run-Git init
}

$currentBranch = (& git branch --show-current).Trim()
if (-not $currentBranch) {
  Run-Git checkout -b $Branch
} elseif ($currentBranch -ne $Branch) {
  Run-Git branch -M $Branch
}

$origin = ""
try {
  $origin = (& git remote get-url origin 2>$null).Trim()
} catch {
  $origin = ""
}

if (-not $origin) {
  if (Get-Command "gh" -ErrorAction SilentlyContinue) {
    $visibility = if ($Private) { "--private" } else { "--public" }
    $repoExists = $true
    try {
      & gh repo view $repoFullName *> $null
    } catch {
      $repoExists = $false
    }

    if (-not $repoExists) {
      & gh repo create $repoFullName $visibility --source "." --remote "origin"
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to create GitHub repository. Check gh auth login."
      }
    } else {
      Run-Git remote add origin $remoteUrl
    }
  } else {
    Run-Git remote add origin $remoteUrl
    Write-Host "GitHub CLI (gh) was not found, so only the origin URL was added."
    Write-Host "If the repository does not exist yet, create it first: https://github.com/new"
  }
} else {
  Write-Host "Using origin: $origin"
}

Run-Git add -A

$staged = @(& git diff --cached --name-only)
if ($staged.Count -gt 0) {
  if (-not $Message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "Update Naru Europe 2026 ($timestamp)"
  }

  & git commit -m $Message
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Commit failed. If Git user info is missing, run these once:"
    Write-Host 'git config --global user.name "Your Name"'
    Write-Host 'git config --global user.email "you@example.com"'
    exit 1
  }
} else {
  Write-Host "No changes to commit."
}

$head = ""
try {
  $head = (& git rev-parse --verify HEAD 2>$null).Trim()
} catch {
  $head = ""
}

if (-not $head) {
  throw "There is no commit to push to GitHub yet."
}

Run-Git push -u origin $Branch

Write-Host ""
Write-Host "GitHub sync complete:"
Write-Host "https://github.com/$repoFullName"

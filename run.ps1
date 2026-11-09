param(
    [int]$Port = 8787,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path (Join-Path $root 'frontend\dist\index.html'))) {
    Write-Host 'Frontend bundle not found.' -ForegroundColor Yellow
    Write-Host 'Install Node.js 20+, then run:' -ForegroundColor Yellow
    Write-Host '  cd frontend' -ForegroundColor Cyan
    Write-Host '  pnpm install' -ForegroundColor Cyan
    Write-Host '  pnpm build' -ForegroundColor Cyan
    exit 1
}

$python = $null
$workspacePython = Join-Path (Split-Path -Parent $root) '.venv\Scripts\python.exe'
if (Test-Path $workspacePython) { $python = $workspacePython; $pythonArgs = @() }
if (-not $python -and (Get-Command py -ErrorAction SilentlyContinue)) {
    & py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) { $python = 'py'; $pythonArgs = @('-3') }
}
if (-not $python -and (Get-Command python3 -ErrorAction SilentlyContinue)) {
    & python3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) { $python = 'python3'; $pythonArgs = @() }
}
if (-not $python -and (Get-Command python -ErrorAction SilentlyContinue)) {
    & python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) { $python = 'python'; $pythonArgs = @() }
}
if (-not $python) {
    $workspacePython = Join-Path (Split-Path -Parent $root) '.venv\Scripts\python.exe'
    if (Test-Path $workspacePython) { $python = $workspacePython; $pythonArgs = @() }
}
if (-not $python) {
    $bundled = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
    if (Test-Path $bundled) { $python = $bundled; $pythonArgs = @() }
}

if (-not $python) {
    Write-Host 'Python 3.10 or newer is required.' -ForegroundColor Red
    exit 1
}

$env:PORT = "$Port"
$env:FLOWGRID_PORT = "$Port"
if (-not $env:FLOWGRID_DB) {
    $env:FLOWGRID_DB = Join-Path $root 'data\flowgrid.db'
}

$backend = Join-Path $root 'backend'
$localPackages = Join-Path $root '.runtime-packages'
$paths = @($backend)
if (Test-Path $localPackages) { $paths += $localPackages }
if ($env:PYTHONPATH) { $paths += $env:PYTHONPATH }
$env:PYTHONPATH = ($paths -join ';')

$useFastApi = $false
$ErrorActionPreference = 'Continue'
& $python @pythonArgs -c "import fastapi, uvicorn" *> $null
if ($LASTEXITCODE -eq 0) { $useFastApi = $true }
$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '  FlowGrid · Traffic Route Intelligence' -ForegroundColor Green
Write-Host "  http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host ("  Runtime: " + ($(if ($useFastApi) { 'FastAPI' } else { 'stdlib fallback' }))) -ForegroundColor DarkGray
Write-Host '  Simulation data only — not live traffic' -ForegroundColor DarkGray
Write-Host ''

if (-not $NoBrowser) {
    Start-Job -ScriptBlock {
        param($url)
        Start-Sleep -Seconds 2
        Start-Process $url
    } -ArgumentList "http://127.0.0.1:$Port" | Out-Null
}

if ($useFastApi) {
    & $python @pythonArgs -m uvicorn app.api:app --host 127.0.0.1 --port $Port
} else {
    & $python @pythonArgs 'backend\run.py'
}

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
$output = Join-Path $dist "checksums.sha256"

if (-not (Test-Path $dist)) {
  throw "dist directory does not exist. Run npm run dist first."
}

$targets = @(
  "FloatWave Setup *.exe",
  "FloatWave Setup *.exe.blockmap",
  "latest.yml"
)

$files = foreach ($pattern in $targets) {
  Get-ChildItem -Path $dist -Filter $pattern -File -ErrorAction SilentlyContinue
}

$files = $files | Sort-Object Name -Unique

if (-not $files -or $files.Count -eq 0) {
  throw "No release artifacts found in dist."
}

$lines = foreach ($file in $files) {
  $hash = Get-FileHash -Path $file.FullName -Algorithm SHA256
  "$($hash.Hash.ToLowerInvariant())  $($file.Name)"
}

$lines | Set-Content -Path $output -Encoding ASCII
Write-Host "Wrote $output"

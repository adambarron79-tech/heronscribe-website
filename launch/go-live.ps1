# HeronScribe go-live switch. Run ONLY after solicitor approval.
# Removes the noindex tag, installs the live robots.txt, commits and pushes.
# Usage (PowerShell, from the repo folder):  .\launch\go-live.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$idx  = Join-Path $root 'public\index.html'
$html = [System.IO.File]::ReadAllText($idx)

$confirm = Read-Host "Has Steph approved the legal documents and site copy? (yes/no)"
if ($confirm -ne 'yes') { Write-Host 'Stopped. Nothing changed.'; exit 1 }

$pattern = '(?m)^<!-- DEV: remove this noindex line[^\r\n]*-->\r?\n<meta name="robots" content="noindex, nofollow">\r?\n'
$new = [regex]::Replace($html, $pattern, '')
if ($new -match 'noindex') { throw 'noindex tag still present - edit public/index.html by hand.' }
[System.IO.File]::WriteAllText($idx, $new, (New-Object System.Text.UTF8Encoding($false)))

Copy-Item (Join-Path $PSScriptRoot 'robots.live.txt') (Join-Path $root 'public\robots.txt') -Force

Set-Location $root
git add public/index.html public/robots.txt
git commit -m "Go live: remove noindex, publish live robots.txt"
git push
Write-Host 'Pushed. Cloudflare redeploys in 1-2 minutes. Then follow the go-live checklist.'

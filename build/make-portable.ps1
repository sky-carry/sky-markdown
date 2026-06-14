# Assemble a portable Windows build WITHOUT electron-builder (avoids the winCodeSign
# symlink-privilege failure). Copies the Electron runtime, drops our app into
# resources/app, sets the exe icon/metadata via rcedit, and zips it.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $root 'node_modules\electron\dist'
$rel  = Join-Path $root 'release'
$app  = Join-Path $rel  'SkyMarkdown-win-x64'
$exeName = 'Sky Markdown.exe'
$version = '0.1.0'

Write-Output "1/6 clean release dir"
if (Test-Path $app) { Remove-Item $app -Recurse -Force }
New-Item -ItemType Directory -Force -Path $app | Out-Null

Write-Output "2/6 copy electron runtime ($([math]::Round(((Get-ChildItem $dist -Recurse -File | Measure-Object Length -Sum).Sum/1MB),0)) MB)"
Copy-Item "$dist\*" $app -Recurse -Force

Write-Output "3/6 stage app into resources/app"
$resApp = Join-Path $app 'resources\app'
New-Item -ItemType Directory -Force -Path $resApp | Out-Null
Copy-Item (Join-Path $root 'out')          (Join-Path $resApp 'out') -Recurse -Force
Copy-Item (Join-Path $root 'package.json') (Join-Path $resApp 'package.json') -Force
Copy-Item (Join-Path $root 'build\icon.png') (Join-Path $resApp 'icon.png') -Force
# default_app is ignored when resources/app exists, but remove it to keep things tidy
Remove-Item (Join-Path $app 'resources\default_app.asar') -Force -ErrorAction SilentlyContinue

Write-Output "4/6 rename electron.exe -> '$exeName'"
Rename-Item (Join-Path $app 'electron.exe') $exeName -Force
$exePath = Join-Path $app $exeName

Write-Output "5/6 set exe icon + metadata (rcedit)"
$rcedit = Join-Path $root 'node_modules\rcedit\bin\rcedit-x64.exe'
$ico = Join-Path $root 'build\icon.ico'
& $rcedit "$exePath" `
  --set-icon "$ico" `
  --set-version-string 'ProductName' 'Sky Markdown' `
  --set-version-string 'FileDescription' 'Sky Markdown — Markdown 编辑器' `
  --set-version-string 'CompanyName' 'Sky' `
  --set-version-string 'LegalCopyright' '(c) 2026 Sky · MIT' `
  --set-version-string 'OriginalFilename' $exeName `
  --set-file-version $version `
  --set-product-version $version
Write-Output "   rcedit done"

Write-Output "6/6 zip"
$7za = Join-Path $root 'node_modules\7zip-bin\win\x64\7za.exe'
$zip = Join-Path $rel "Sky-Markdown-$version-win-x64.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
if (Test-Path $7za) {
  & $7za a -tzip -mx=7 "$zip" "$app" | Out-Null
} else {
  Compress-Archive -Path $app -DestinationPath $zip -CompressionLevel Optimal
}
$zipMB = [math]::Round((Get-Item $zip).Length/1MB,1)
$dirMB = [math]::Round(((Get-ChildItem $app -Recurse -File | Measure-Object Length -Sum).Sum/1MB),1)
Write-Output ("DONE  unpacked={0} MB  zip={1} MB  -> {2}" -f $dirMB, $zipMB, $zip)
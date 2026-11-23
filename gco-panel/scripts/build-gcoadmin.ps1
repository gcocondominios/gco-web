$ErrorActionPreference = "Stop"
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
$projectDir = "c:\Proyectos\Automatizaciones GCO\gco-panel"
$destDir = "c:\Proyectos\Automatizaciones GCO\panel-gco-para-gcoadmin\panel-gco"

Set-Location $projectDir

# Export static bundle mounted at /panel-gco
$env:GCO_STATIC_EXPORT = "true"
$env:NEXT_PUBLIC_BASE_PATH = "/panel-gco"

Write-Host "Building static export for https://gcoadmin.cl/panel-gco/ ..."
npm.cmd run build

if (Test-Path $destDir) {
    Remove-Item -Recurse -Force $destDir
}
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $projectDir "out\*") $destDir

Write-Host "DONE! Ready to upload folder: $destDir"

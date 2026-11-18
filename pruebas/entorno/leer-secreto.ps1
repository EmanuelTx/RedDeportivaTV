# Uso interno de las herramientas Node: imprime {"usuario":..,"clave":..} del secreto pedido.
param([Parameter(Mandatory)][string]$Nombre)
if ($Nombre -notmatch '^RDTV-pruebas-[a-z-]+$') { Write-Error 'Nombre no permitido'; exit 2 }
. "$PSScriptRoot\credenciales.ps1"
$s = Leer-Secreto $Nombre
if (-not $s) { Write-Output 'null'; exit 0 }
$s | ConvertTo-Json -Compress

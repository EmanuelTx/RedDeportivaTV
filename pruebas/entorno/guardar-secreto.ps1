# Guarda en el Administrador de credenciales un secreto leido por la entrada estandar
# (asi no aparece en la linea de comandos). Uso interno de las herramientas Node.
param([Parameter(Mandatory)][string]$Nombre, [Parameter(Mandatory)][string]$Usuario)
if ($Nombre -notmatch '^RDTV-(pruebas|produccion)-[a-z-]+$') { Write-Error 'Nombre no permitido'; exit 2 }
. "$PSScriptRoot\credenciales.ps1"
$plano = [Console]::In.ReadToEnd().Trim()
if (-not $plano) { Write-Error 'Vacio'; exit 2 }
Guardar-Secreto $Nombre $Usuario (ConvertTo-SecureString $plano -AsPlainText -Force)

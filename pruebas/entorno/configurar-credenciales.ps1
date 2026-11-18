# PASO ÚNICO (lo hace la persona, una sola vez): guardar la contraseña de la base de PRUEBAS
# en el Administrador de credenciales de Windows. No se escribe en ningún archivo.
. "$PSScriptRoot\credenciales.ps1"
$refPruebas = 'czblgqmcahjnbxbcgwke'
$refProduccion = 'mopsakafycvolxxgatga'
Write-Host ''
Write-Host 'Contraseña de la base de datos del proyecto de PRUEBAS (reddeportivatv-pruebas).'
Write-Host 'Se escribe oculta y queda guardada solo en este equipo (Administrador de credenciales).'
$c = Read-Host 'Contraseña' -AsSecureString
$plano = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($c))
if (-not $plano -or $plano.Length -lt 8) { Write-Host 'Muy corta o vacía. No se guardó nada.' -ForegroundColor Red; exit 1 }
if ($plano.Contains($refProduccion)) { Write-Host 'Eso parece del proyecto de producción. No se guardó.' -ForegroundColor Red; exit 1 }
Guardar-Secreto 'RDTV-pruebas-db' "postgres.$refPruebas" $c
Write-Host 'Guardada. Probando la conexión…'
$nodo = Join-Path $env:LOCALAPPDATA 'RedDeportivaTV-dev\node'
$env:Path = "$nodo;$env:Path"
Push-Location $PSScriptRoot
node ejecutar-sql.mjs --sql "select current_database() as base, current_user as usuario, now() as hora"
Pop-Location

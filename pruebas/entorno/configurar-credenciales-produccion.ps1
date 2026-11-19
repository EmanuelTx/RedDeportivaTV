# PASO MANUAL (una sola vez): guardar la contrasena de la base de PRODUCCION en el
# Administrador de credenciales de Windows. No se escribe en ningun archivo.
# Se escribe SOLO cuando aparece el pedido "Contrasena:" (oculta).
. "$PSScriptRoot\credenciales.ps1"
$refProduccion = 'mopsakafycvolxxgatga'
Write-Host ''
Write-Host 'Contrasena de la base de datos de PRODUCCION (proyecto reddeportivatv).'
Write-Host 'Se escribe oculta y queda guardada solo en este equipo (Administrador de credenciales).'
$c = Read-Host 'Contrasena' -AsSecureString
$plano = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($c))
if (-not $plano -or $plano.Length -lt 8) { Write-Host 'Muy corta o vacia. No se guardo nada.' -ForegroundColor Red; exit 1 }
Guardar-Secreto 'RDTV-produccion-db' "postgres.$refProduccion" $c
Write-Host 'Guardada. Ya podes cerrar esta ventana.' -ForegroundColor Green

# Almacén de secretos en el Administrador de credenciales de Windows (por usuario,
# cifrado por Windows). NUNCA escribe secretos en archivos del proyecto.
#   . .\credenciales.ps1 ; Guardar-Secreto 'RDTV-pruebas-db' 'usuario' $secureString
#   Leer-Secreto 'RDTV-pruebas-db'   -> @{ usuario=..; clave=.. }  ($null si no existe)
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class CredMan {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize;
    public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CredWrite(ref CREDENTIAL c, int f);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CredRead(string t, int type, int f, out IntPtr p);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CredDelete(string t, int type, int f);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr p);
  public static void Write(string target, string user, string secret) {
    byte[] b = Encoding.Unicode.GetBytes(secret);
    CREDENTIAL c = new CREDENTIAL(); c.Type = 1; c.TargetName = target; c.UserName = user;
    c.CredentialBlobSize = b.Length; c.Persist = 2; // solo este equipo y usuario
    c.CredentialBlob = Marshal.AllocHGlobal(b.Length); Marshal.Copy(b, 0, c.CredentialBlob, b.Length);
    try { if (!CredWrite(ref c, 0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
    finally { Marshal.FreeHGlobal(c.CredentialBlob); }
  }
  public static string[] Read(string target) {
    IntPtr p; if (!CredRead(target, 1, 0, out p)) return null;
    try { CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      string s = Encoding.Unicode.GetString(ReadBytes(c.CredentialBlob, c.CredentialBlobSize));
      return new string[] { c.UserName, s }; } finally { CredFree(p); }
  }
  static byte[] ReadBytes(IntPtr p, int n) { byte[] b = new byte[n]; Marshal.Copy(p, b, 0, n); return b; }
  public static bool Delete(string target) { return CredDelete(target, 1, 0); }
}
'@

function Guardar-Secreto([string]$Nombre, [string]$Usuario, [System.Security.SecureString]$Clave) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Clave)
  try { [CredMan]::Write($Nombre, $Usuario, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Leer-Secreto([string]$Nombre) {
  $r = [CredMan]::Read($Nombre); if (-not $r) { return $null }
  return @{ usuario = $r[0]; clave = $r[1] }
}
function Borrar-Secreto([string]$Nombre) { [void][CredMan]::Delete($Nombre) }

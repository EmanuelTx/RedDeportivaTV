// Comprobación completa del entorno de pruebas (ejecutar al empezar cada sesión):
//   node comprobar-entorno.mjs
import { ejecutar } from "./ejecutar-sql.mjs";
import { abrir, iniciarSesionAdmin, BASE } from "./navegador.mjs";
import { REF_PRUEBAS } from "./proyecto.mjs";

const ok = (t) => console.log("  OK  " + t);
let fallos = 0;
const falla = (t) => { fallos++; console.log("FALLA " + t); };

try {
  const r = await ejecutar("select (select ref from private.entorno_pruebas) as ref, (select count(*)::int from public.administradores) as admins");
  r.rows[0].ref === REF_PRUEBAS ? ok(`Base de datos: proyecto de pruebas (${r.rows[0].ref}), ${r.rows[0].admins} administradores`) : falla("La base no es la de pruebas");
} catch (e) { falla("Base de datos: " + e.message); }

try {
  const res = await fetch(BASE + "/api/config");
  const cfg = await res.json();
  cfg.supabaseUrl && cfg.supabaseUrl.includes(REF_PRUEBAS) ? ok("Servidor local activo y apuntando a pruebas") : falla("El servidor local no apunta a pruebas");
} catch (e) { falla("Servidor local apagado (node servidor-local.mjs): " + e.message); }

let nav;
try {
  nav = await abrir({ conSesion: true });
  const pagina = await nav.contexto.newPage();
  const estado = await iniciarSesionAdmin(pagina, nav.contexto);
  ok("Panel de administración: " + estado);
  await pagina.goto(BASE + "/admin/#/");
  await pagina.waitForSelector("#salir");
  // Un intento deliberado a producción debe quedar bloqueado
  const bloqueado = await pagina.evaluate(() => fetch("https://mopsakafycvolxxgatga.supabase.co/rest/v1/").then(() => false, () => true));
  bloqueado ? ok("Bloqueo de producción en el navegador funciona") : falla("¡El navegador pudo llegar a producción!");
} catch (e) { falla("Navegador: " + e.message); }
finally { if (nav) await nav.cerrar(); }

console.log(fallos ? `\n${fallos} problema(s).` : "\nEntorno de pruebas listo.");
process.exit(fallos ? 1 : 0);

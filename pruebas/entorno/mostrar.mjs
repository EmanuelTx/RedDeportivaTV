// Abre una ventana VISIBLE de Edge (con la sesión del administrador de pruebas) para que una persona revise el sitio.
//   node mostrar.mjs [ruta]     (queda abierta hasta que se cierre la ventana)
import { abrir, iniciarSesionAdmin, BASE } from "./navegador.mjs";
const ruta = process.argv[2] || "/";
const nav = await abrir({ conSesion: true, visible: true });
const p = await nav.contexto.newPage();
await iniciarSesionAdmin(p, nav.contexto);
await p.goto(BASE + ruta);
const web = await nav.contexto.newPage();
await web.goto(BASE + "/");
await p.bringToFront();
console.log("Ventana abierta. Cerrala cuando termines.");
await new Promise((ok) => nav.navegador.on("disconnected", ok));

/* =========================================================
   Panel RedDeportivaTV · inicio, sesión y navegación
   - Configuración pública desde /api/config (variables de Cloudflare).
   - Solo entran usuarios registrados en public.administradores.
   - La seguridad real la dan las reglas RLS de la base: aunque alguien
     abra esta página, sin una cuenta de administrador no puede ver
     borradores ni modificar nada.
   ========================================================= */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
import { app } from "./estado.js";
import { h, vaciar, aviso, campo, boton, conBoton, errorAmigable } from "./ui.js";
import * as publicaciones from "./publicaciones.js";
import * as catalogos from "./catalogos.js";
import * as transmisiones from "./transmisiones.js";

const $ = (id) => document.getElementById(id);

const SECCIONES = {
  noticias: (main, p) => publicaciones.vista(main, "noticias", p),
  albumes: (main, p) => publicaciones.vista(main, "albumes", p),
  campeonatos: (main) => catalogos.vista(main, "campeonatos"),
  categorias: (main) => catalogos.vista(main, "categorias"),
  partidos: (main) => catalogos.vista(main, "partidos"),
  envivo: (main) => transmisiones.vista(main),
  cuenta: (main) => vistaCuenta(main)
};

/* ---------- Configuración ---------- */

async function configuracion() {
  try {
    const r = await fetch("/api/config", { cache: "no-store" });
    if (r.ok) {
      const c = await r.json();
      if (c.configurado) return c;
    }
  } catch (_) { /* sin funciones (por ejemplo, en un servidor local) */ }
  throw new Error("El panel no está configurado: faltan las variables de Supabase en Cloudflare.");
}

/* ---------- Pantallas ---------- */

function pantalla(cual) {
  $("cargando").hidden = cual !== "cargando";
  $("login").hidden = cual !== "login";
  $("panel").hidden = cual !== "panel";
}

function mostrarError(mensaje) {
  pantalla("cargando");
  vaciar($("cargando"), h("p", { class: "error" }, mensaje));
}

function mostrarLogin(mensaje) {
  pantalla("login");
  $("loginMensaje").textContent = mensaje || "";
  $("loginCorreo").focus();
}

async function verificarAdmin(usuario) {
  const { data, error } = await app.sb.from("administradores").select("nombre").eq("user_id", usuario.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function entrar(sesion) {
  const admin = await verificarAdmin(sesion.user);
  if (!admin) {
    await app.sb.auth.signOut({ scope: "local" });
    mostrarLogin("Esta cuenta no tiene permiso de administrador.");
    return;
  }
  app.usuario = sesion.user;
  app.nombre = admin.nombre;
  $("usuarioNombre").textContent = admin.nombre;
  pantalla("panel");
  if (!location.hash || location.hash === "#") location.replace("#/noticias");
  else await navegar();
}

/* ---------- Navegación ---------- */

function rutaActual() {
  const partes = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const seccion = SECCIONES[partes[0]] ? partes[0] : "noticias";
  return { seccion, params: partes.slice(1) };
}

async function navegar() {
  if (!app.usuario) return;
  const { seccion, params } = rutaActual();
  document.querySelectorAll(".menu a").forEach((a) => a.classList.toggle("activo", a.dataset.seccion === seccion));
  document.body.classList.remove("menu-abierto");
  const main = $("principal");
  vaciar(main, h("p", { class: "cargando" }, "Cargando…"));
  try {
    await SECCIONES[seccion](main, params);
    main.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    vaciar(main, h("p", { class: "error" }, errorAmigable(e)), boton("Reintentar", navegar));
  }
}

/* ---------- Mi cuenta ---------- */

function vistaCuenta(main) {
  const nueva = h("input", { type: "password", minlength: 10, autocomplete: "new-password", required: true });
  const repetir = h("input", { type: "password", minlength: 10, autocomplete: "new-password", required: true });
  const cambiar = h("button", { class: "btn btn--primary", type: "submit" }, "Cambiar contraseña");
  const form = h("form", { class: "form" },
    campo("Contraseña nueva", nueva, "Mínimo 10 caracteres. Mejor varias palabras al azar."),
    campo("Repetir contraseña", repetir),
    h("div", { class: "acciones" }, cambiar));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    if (nueva.value !== repetir.value) { aviso("Las contraseñas no coinciden.", "error"); return; }
    await conBoton(cambiar, async () => {
      const { error } = await app.sb.auth.updateUser({ password: nueva.value });
      if (error) throw error;
      nueva.value = repetir.value = "";
      aviso("Contraseña cambiada.");
    }, "Cambiando…");
  });
  vaciar(main,
    h("div", { class: "cabecera" }, h("h1", { text: "Mi cuenta" })),
    h("section", { class: "bloque" },
      h("p", {}, h("strong", { text: app.nombre }), h("br"), app.usuario.email),
      form),
    h("section", { class: "bloque" },
      h("h2", { text: "Seguridad" }),
      h("p", { class: "nota" }, "Si perdiste un celular o usaste una computadora ajena, cerrá la sesión en todos lados."),
      boton("Cerrar sesión en todos los dispositivos", (ev) => conBoton(ev.target, async () => {
        await app.sb.auth.signOut({ scope: "global" });
      }), "btn--peligro")));
}

/* ---------- Arranque ---------- */

async function iniciar() {
  let cfg;
  try {
    cfg = await configuracion();
  } catch (e) {
    mostrarError(e.message);
    return;
  }
  app.sb = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "rdtv-admin" }
  });

  app.sb.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT") {
      app.usuario = null;
      mostrarLogin("Sesión cerrada.");
    }
  });

  $("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = $("loginBoton");
    $("loginMensaje").textContent = "";
    await conBoton(btn, async () => {
      const { data, error } = await app.sb.auth.signInWithPassword({
        email: $("loginCorreo").value.trim(),
        password: $("loginClave").value
      });
      $("loginClave").value = "";
      if (error) {
        $("loginMensaje").textContent = /invalid/i.test(error.message)
          ? "Correo o contraseña incorrectos."
          : errorAmigable(error);
        return;
      }
      await entrar(data.session);
    }, "Entrando…");
  });

  $("salir").addEventListener("click", () => app.sb.auth.signOut({ scope: "local" }));
  $("menuBoton").addEventListener("click", () => document.body.classList.toggle("menu-abierto"));
  window.addEventListener("hashchange", navegar);

  try {
    const { data } = await app.sb.auth.getSession();
    if (data.session) await entrar(data.session);
    else mostrarLogin();
  } catch (e) {
    mostrarLogin(errorAmigable(e));
  }
}

iniciar();

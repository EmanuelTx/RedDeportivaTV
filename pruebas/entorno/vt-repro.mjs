// Reproduce el aviso de ViewTransition: captura de página completa (cambia el tamaño de la ventana) y luego navegación por un enlace.
import { chromium } from "playwright-core";
const base = process.argv[2];
const nav = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await nav.newContext({ viewport: { width: 1366, height: 800 } });
let n = 0, animaciones = 0;
for (let i = 0; i < 6; i++) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => { if (/Transition/.test(e.message)) n++; });
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.screenshot({ fullPage: true });
  await p.locator("a[href='/noticias']").first().click();
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(500);
  // la regla de animación sigue activa en computadoras
  animaciones += await p.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.cssText && r.cssText.includes("view-transition")); } catch { return false; } }) ? 1 : 0);
  await p.close();
}
console.log(base, "→ avisos de ViewTransition:", n, "de 6 intentos · regla de animación presente en", animaciones, "de 6");
await nav.close();

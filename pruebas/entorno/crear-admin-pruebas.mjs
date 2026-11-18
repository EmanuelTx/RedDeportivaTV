// Crea (o restablece) un administrador EXCLUSIVO para pruebas automáticas en el
// proyecto de PRUEBAS. No toca ninguna cuenta real. La contraseña se genera al azar
// y se guarda solo en el Administrador de credenciales de Windows.
import crypto from "node:crypto";
import { conectar } from "./ejecutar-sql.mjs";
import { guardarSecreto } from "./proyecto.mjs";

const EMAIL = "robot-pruebas@reddeportivatv.test";
const clave = crypto.randomBytes(18).toString("base64url") + "aA1!";
const c = await conectar();
try {
  await c.query("begin");
  const { rows } = await c.query("select id from auth.users where email=$1", [EMAIL]);
  let id = rows[0]?.id;
  if (id) {
    await c.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at=now() where id=$1", [id, clave]);
  } else {
    id = crypto.randomUUID();
    await c.query(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000',$1::uuid,'authenticated','authenticated',$2,extensions.crypt($3, extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`, [id, EMAIL, clave]);
    await c.query(`insert into auth.identities (id,user_id,provider_id,provider,identity_data,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),$1::uuid,$1::text,'email',jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true),now(),now(),now())`, [id, EMAIL]);
  }
  await c.query("insert into public.administradores (user_id, nombre) values ($1,'Robot de pruebas') on conflict (user_id) do nothing", [id]);
  await c.query("commit");
  guardarSecreto("RDTV-pruebas-admin", EMAIL, clave);
  console.log("Administrador de pruebas listo:", EMAIL, "(contraseña guardada en el Administrador de credenciales)");
} catch (e) { await c.query("rollback").catch(() => {}); console.error("ERROR:", e.message); process.exitCode = 1; }
finally { await c.end(); }

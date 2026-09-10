// Autenticación local simplificada para la app offline: no hay servidor al
// que enviarle un token, así que "iniciar sesión" solo verifica la
// contraseña contra lo guardado en la base de datos local (mismo esquema
// users que el servidor) y guarda la sesión en localStorage — igual que ya
// hace public/app.js con la respuesta {token, user} del servidor remoto, así
// que login.html no necesita cambios.
function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function pbkdf2(password, salt) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = (stored || "").split(":");
  if (!saltHex || !hashHex) return false;
  const candidate = await pbkdf2(password, fromHex(saltHex));
  return toHex(candidate) === hashHex;
}

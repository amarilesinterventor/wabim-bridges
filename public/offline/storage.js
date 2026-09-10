// Adaptador de almacenamiento persistente para la app offline: guarda el
// archivo de la base de datos SQLite (un solo blob de bytes, exportado por
// sql.js) y las fotografías (archivos individuales) en el dispositivo.
//
// - Dentro de la app Android empaquetada con Capacitor: usa el plugin
//   @capacitor/filesystem (almacenamiento privado de la app, Directory.Data
//   — persiste entre reinicios, no requiere permisos de almacenamiento del
//   sistema porque es privado de la app).
// - Corriendo como página web normal (navegador de escritorio, para poder
//   probar toda la lógica offline sin compilar la app Android — ver
//   ?offline=1 en app.js): usa IndexedDB, que cumple el mismo rol.

import { Capacitor, Filesystem, Directory } from "/vendor/capacitor-bundle.js";

const DB_FILE = "wabim.sqlite";
const PHOTOS_DIR = "wabim-photos";

function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

// --- Utilidades de conversión (Capacitor Filesystem trabaja en base64) -----

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- IndexedDB (fallback de escritorio/pruebas) -----------------------------

const IDB_NAME = "wabim-offline";
const IDB_STORE = "files";

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- API pública: base de datos ---------------------------------------------

export async function loadBytes() {
  if (isNativePlatform()) {
    try {
      const res = await Filesystem.readFile({ path: DB_FILE, directory: Directory.Data });
      return base64ToBytes(res.data);
    } catch {
      return null; // primera vez: el archivo todavía no existe
    }
  }
  return idbGet(DB_FILE);
}

export async function saveBytes(bytes) {
  if (isNativePlatform()) {
    await Filesystem.writeFile({
      path: DB_FILE,
      data: bytesToBase64(bytes),
      directory: Directory.Data,
    });
    return;
  }
  await idbSet(DB_FILE, bytes);
}

// --- API pública: fotografías (un archivo por foto) -------------------------
//
// IMPORTANTE: lo que se guarda en la base de datos (columna photos.url) es
// SIEMPRE la ruta relativa ESTABLE (p.ej. "wabim-photos/<subdir>/<archivo>"),
// nunca una URL "viva" — un blob: URL de escritorio solo vive en memoria de
// esa sesión de página y deja de servir tras recargar/reabrir la app, así
// que guardarlo en la BD dejaría fotos rotas al reabrir. Para MOSTRAR una
// foto hay que resolver su ruta estable a una URL viva con resolvePhotoUrl()
// en el momento de renderizar (ver localApi.js).

/** Guarda una foto (dataURL "data:image/xxx;base64,...") y devuelve su ruta relativa ESTABLE (no una URL para <img src> — ver resolvePhotoUrl). */
export async function savePhotoFile(dataUrl, subdir, filename) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Formato de imagen inválido.");
  const [, , base64] = match;
  const relPath = `${PHOTOS_DIR}/${subdir}/${filename}`;

  if (isNativePlatform()) {
    await Filesystem.writeFile({ path: relPath, data: base64, directory: Directory.Data, recursive: true });
  } else {
    // Fallback de escritorio (pruebas): se guarda como blob en IndexedDB.
    await idbSet(`photo:${relPath}`, base64ToBytes(base64));
  }
  return relPath;
}

/** Convierte una ruta relativa estable (guardada en BD) en una URL utilizable en <img src> ahora mismo. */
export async function resolvePhotoUrl(relPath) {
  if (!relPath) return null;
  if (isNativePlatform()) {
    const uriRes = await Filesystem.getUri({ path: relPath, directory: Directory.Data });
    // Capacitor.convertFileSrc() convierte una ruta nativa (file://...) en un
    // esquema que el WebView puede cargar en <img src> (p.ej. capacitor://).
    return Capacitor.convertFileSrc(uriRes.uri);
  }
  const bytes = await idbGet(`photo:${relPath}`);
  if (!bytes) return null;
  // Se crea un blob: URL nuevo cada vez que se resuelve (no se puede
  // persistir uno solo entre sesiones): es aceptable porque este fallback es
  // solo para probar la app en un navegador de escritorio.
  return URL.createObjectURL(new Blob([bytes]));
}

export async function deletePhotoFile(relPath) {
  if (isNativePlatform()) {
    try {
      await Filesystem.deleteFile({ path: relPath, directory: Directory.Data });
    } catch {
      // El archivo ya no existe; no es un error fatal.
    }
    return;
  }
  const db = await openIdb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(`photo:${relPath}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export { isNativePlatform };

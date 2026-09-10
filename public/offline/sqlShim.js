// Envoltorio sobre sql.js (SQLite compilado a WebAssembly) que imita la forma
// de la API de `node:sqlite` (DatabaseSync: `db.prepare(sql).run/get/all(...)`)
// usada por el servidor (src/db/queries.ts). La idea es que la lógica de
// consultas se pueda razonar igual en ambos lados (mismo SQL, mismos nombres
// de columnas) aunque esta copia esté escrita a mano en JS plano para la app
// offline — ver public/offline/localData.js.
//
// Por qué sql.js y no un plugin nativo de SQLite (p.ej. @capacitor-community/
// sqlite): sql.js corre igual dentro de un WebView de Capacitor que en un
// navegador de escritorio normal, sin depender de un plugin nativo adicional
// ni de código Java/Kotlin propio — así toda la lógica se puede probar en un
// navegador de verdad antes de siquiera compilar la app Android.
//
// Persistencia: sql.js mantiene la base de datos en memoria; después de cada
// escritura se exporta a bytes y se guarda (con "debounce") vía el adaptador
// de almacenamiento de turno (Capacitor Filesystem en la app nativa,
// IndexedDB en un navegador de escritorio para pruebas — ver storage.js).

import { loadBytes, saveBytes } from "./storage.js";

let SQL = null;
let db = null;
let saveTimer = null;

/**
 * /vendor/sql-wasm.js es un script clásico (UMD, no ESM) que define el
 * global `initSqlJs`. No se carga con una etiqueta <script> fija en cada
 * *.html porque ese archivo solo existe en el build offline (Android) — en
 * el despliegue web normal ni siquiera está presente, y no tiene sentido
 * que cada página web intente cargarlo. Se inyecta aquí, solo la primera vez
 * que de verdad se entra en modo offline (ver isOfflineMode() en app.js).
 */
function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(el);
  });
}

async function ensureSqlJsLoaded() {
  if (SQL) return SQL;
  await loadClassicScript("/vendor/sql-wasm.js");
  SQL = await window.initSqlJs({
    locateFile: (file) => `/vendor/${file}`,
  });
  return SQL;
}

/** Carga la base de datos persistida, o crea una vacía si es la primera vez. */
export async function openDatabase() {
  await ensureSqlJsLoaded();
  const existing = await loadBytes();
  db = existing ? new SQL.Database(existing) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  return db;
}

function schedulePersist() {
  if (saveTimer) clearTimeout(saveTimer);
  // Se agrupan varias escrituras seguidas (p.ej. sembrar el catálogo, que son
  // cientos de INSERT) en un solo guardado, en vez de uno por cada fila.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const bytes = db.export();
    saveBytes(bytes).catch((err) => console.error("No se pudo guardar la base de datos local:", err));
  }, 300);
}

/** Fuerza el guardado inmediato (p.ej. antes de cerrar/pausar la app). */
export function flushPersist() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!db) return Promise.resolve();
  return saveBytes(db.export());
}

function rowsFromStatement(stmt) {
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  return rows;
}

/**
 * Imita `db.prepare(sql)` de node:sqlite: devuelve un objeto con
 * `.run(...params)`, `.get(...params)` y `.all(...params)`, todos
 * síncronos (igual que el original), con parámetros posicionales `?`.
 */
export function prepare(sql) {
  const isWrite = /^\s*(insert|update|delete)/i.test(sql);
  return {
    run(...params) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
      if (isWrite) schedulePersist();
      return { changes: db.getRowsModified() };
    },
    get(...params) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const has = stmt.step();
      const row = has ? stmt.getAsObject() : undefined;
      stmt.free();
      return row;
    },
    all(...params) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = rowsFromStatement(stmt);
      stmt.free();
      return rows;
    },
  };
}

/** Ejecuta SQL crudo sin parámetros (para el schema.sql y transacciones). */
export function exec(sql) {
  db.run(sql);
}

export function transaction(fn) {
  exec("BEGIN");
  try {
    const result = fn();
    exec("COMMIT");
    schedulePersist();
    return result;
  } catch (err) {
    exec("ROLLBACK");
    throw err;
  }
}

export function newId() {
  // crypto.randomUUID() está disponible en todo WebView/navegador moderno
  // (Android WebView >= Chrome 92, ya universal en dispositivos soportados).
  return crypto.randomUUID();
}

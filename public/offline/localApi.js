// Dispatcher local: implementa el mismo contrato que la función `api(path,
// options)` de public/app.js (mismos paths, mismo formato de payload/
// respuesta, mismos mensajes de error) pero resolviendo todo contra la base
// de datos SQLite local (sql.js) en vez de hacer fetch() a un servidor. Así,
// las páginas HTML (index/bridge/inspection/admin/login) no necesitan saber
// si están habladno con un servidor remoto o con la copia local — ver el
// interruptor en app.js (isOfflineMode()).
import { openDatabase, newId } from "./sqlShim.js";
import { seedIfEmpty } from "./localSeed.js";
import * as q from "./localQueries.js";
import { calculateAndPersist } from "./localWabimService.js";
import { verifyPassword } from "./localAuth.js";
import { savePhotoFile, resolvePhotoUrl, deletePhotoFile, isNativePlatform } from "./storage.js";
import { buildInspectionReportPdfLocal } from "./localReportPdf.js";

const AUTH_KEY = "wabim_auth"; // misma clave de localStorage que usa app.js

let ready = null;
function ensureReady() {
  if (!ready) {
    ready = openDatabase().then(() => seedIfEmpty());
  }
  return ready;
}

function currentUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null")?.user ?? null;
  } catch {
    return null;
  }
}

function requireAdmin() {
  const user = currentUser();
  if (!user || user.role !== "ADMIN") {
    const err = new Error("Se requiere rol de administrador.");
    throw err;
  }
}

// --- Resolución de URLs de fotos (rutas estables en BD -> URL viva) --------

async function resolvePhotosIn(photos) {
  if (!photos?.length) return photos ?? [];
  for (const p of photos) p.url = (await resolvePhotoUrl(p.url)) ?? p.url;
  return photos;
}

async function resolveInspectionPhotos(inspection) {
  if (!inspection) return inspection;
  if (inspection.signature_url) {
    inspection.signature_url = (await resolvePhotoUrl(inspection.signature_url)) ?? inspection.signature_url;
  }
  await resolvePhotosIn(inspection.panoramicPhotos);
  for (const el of inspection.elements ?? []) {
    await resolvePhotosIn(el.photos);
    for (const se of el.subElements ?? []) {
      for (const pa of se.pathologies ?? []) {
        await resolvePhotosIn(pa.photos);
      }
    }
  }
  return inspection;
}

// --- Subida de fotos (comparte lógica entre las dos rutas de fotos) --------

async function uploadPhoto(dataUrl, subdir, extra) {
  const match = /^data:image\/[a-zA-Z+]+;base64,/.exec(dataUrl || "");
  if (!match) throw new Error("Formato de imagen inválido: se esperaba un data URL 'data:image/...;base64,...'.");
  const filename = `${newId()}.jpg`;
  const relPath = await savePhotoFile(dataUrl, subdir, filename);
  const photo = q.addPhoto({ url: relPath, ...extra });
  photo.url = (await resolvePhotoUrl(photo.url)) ?? photo.url;
  return photo;
}

// --- Router -------------------------------------------------------------

const ROUTES = [
  { method: "POST", pattern: /^\/auth\/login$/, handler: async (m, body) => {
    const user = q.findUserByEmail(body?.email ?? "");
    if (!user || !(await verifyPassword(body?.password ?? "", user.password_hash))) {
      throw new Error("Credenciales inválidas.");
    }
    return { token: "local", user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }},
  { method: "GET", pattern: /^\/me$/, handler: async () => ({ user: currentUser() }) },
  { method: "GET", pattern: /^\/users$/, handler: async () => ({ users: q.listUsers() }) },

  { method: "GET", pattern: /^\/catalog$/, handler: async () => q.getCatalog() },
  { method: "PUT", pattern: /^\/catalog\/subcategories\/([^/]+)$/, handler: async (m, body) => { requireAdmin(); q.updateSubCategoryCec(m[1], Number(body.cec)); return { ok: true }; } },
  { method: "PUT", pattern: /^\/catalog\/elements\/([^/]+)$/, handler: async (m, body) => { requireAdmin(); q.updateElementEc(m[1], Number(body.ec)); return { ok: true }; } },
  { method: "PUT", pattern: /^\/catalog\/subelements\/([^/]+)$/, handler: async (m, body) => { requireAdmin(); q.updateSubElementIc(m[1], Number(body.ic)); return { ok: true }; } },
  { method: "PUT", pattern: /^\/catalog\/pathologies\/([^/]+)$/, handler: async (m, body) => { requireAdmin(); q.updatePathologyThresholds(m[1], Number(body.lowMax), Number(body.highMin)); return { ok: true }; } },

  // Sin internet no hay forma de consultar datos.gov.co; se degrada a "sin resultados"
  // en vez de fallar, igual que ya hace searchInviasCatalog() en app.js ante cualquier error.
  { method: "GET", pattern: /^\/invias-catalog\/search$/, handler: async () => ({ results: [] }) },

  { method: "GET", pattern: /^\/bridges$/, handler: async () => ({ bridges: q.listBridges() }) },
  { method: "POST", pattern: /^\/bridges$/, handler: async (m, body) => ({ bridge: q.createBridge(body) }) },
  { method: "GET", pattern: /^\/bridges\/([^/]+)$/, handler: async (m) => {
    const bridge = q.getBridge(m[1]);
    if (!bridge) throw new Error("Puente no encontrado.");
    return { bridge };
  }},
  { method: "DELETE", pattern: /^\/bridges\/([^/]+)$/, handler: async (m) => {
    const bridge = q.getBridge(m[1]);
    if (!bridge) throw new Error("Puente no encontrado.");
    const photoUrls = q.getBridgePhotoUrls(m[1]);
    q.deleteBridge(m[1]);
    for (const relPath of photoUrls) await deletePhotoFile(relPath);
    return { ok: true };
  }},
  { method: "POST", pattern: /^\/bridges\/([^/]+)\/inspections$/, handler: async (m, body) => ({ inspection: q.createInspection(m[1], body) }) },

  { method: "GET", pattern: /^\/inspections\/([^/]+)$/, handler: async (m) => {
    const inspection = q.getInspection(m[1]);
    if (!inspection) throw new Error("Inspección no encontrada.");
    return { inspection: await resolveInspectionPhotos(inspection) };
  }},
  { method: "PATCH", pattern: /^\/inspections\/([^/]+)$/, handler: async (m, body) => ({ inspection: q.updateInspectionResponsible(m[1], body) }) },
  { method: "POST", pattern: /^\/inspections\/([^/]+)\/signature$/, handler: async (m, body) => {
    const existing = q.getInspection(m[1]);
    if (!existing) throw new Error("Inspección no encontrada.");
    if (existing.signature_url) await deletePhotoFile(existing.signature_url);
    const relPath = await savePhotoFile(body.dataUrl, m[1], `signature-${newId()}.png`);
    const inspection = q.updateInspectionSignature(m[1], relPath);
    return { inspection: await resolveInspectionPhotos(inspection) };
  }},
  { method: "DELETE", pattern: /^\/inspections\/([^/]+)\/signature$/, handler: async (m) => {
    const existing = q.getInspection(m[1]);
    if (!existing) throw new Error("Inspección no encontrada.");
    if (existing.signature_url) await deletePhotoFile(existing.signature_url);
    const inspection = q.updateInspectionSignature(m[1], null);
    return { inspection };
  }},
  { method: "POST", pattern: /^\/inspections\/([^/]+)\/elements$/, handler: async (m, body) => ({ id: q.addInspectionElement(m[1], body.elementCode, body.label) }) },
  { method: "DELETE", pattern: /^\/inspection-elements\/([^/]+)$/, handler: async (m) => { q.deleteInspectionElement(m[1]); return { ok: true }; } },
  { method: "POST", pattern: /^\/inspection-elements\/([^/]+)\/subelements$/, handler: async (m, body) => ({ id: q.addInspectionSubElement(m[1], body.subElementCode, Number(body.ic ?? 0), body.label) }) },
  { method: "DELETE", pattern: /^\/inspection-subelements\/([^/]+)$/, handler: async (m) => { q.deleteInspectionSubElement(m[1]); return { ok: true }; } },
  { method: "POST", pattern: /^\/inspection-subelements\/([^/]+)\/pathologies$/, handler: async (m, body) => ({ id: q.addPathologyRecord(m[1], body.pathologyCode, Number(body.measuredValue), Number(body.totalMeasure), body) }) },
  { method: "DELETE", pattern: /^\/pathology-records\/([^/]+)$/, handler: async (m) => { q.deletePathologyRecord(m[1]); return { ok: true }; } },

  { method: "POST", pattern: /^\/inspection-elements\/([^/]+)\/photos$/, handler: async (m, body) => ({
    photo: await uploadPhoto(body.dataUrl, m[1], { caption: body.caption, inspectionElementId: m[1], pathologyRecordId: body.pathologyRecordId || null }),
  })},
  { method: "POST", pattern: /^\/inspections\/([^/]+)\/photos$/, handler: async (m, body) => ({
    photo: await uploadPhoto(body.dataUrl, m[1], { caption: body.caption, inspectionId: m[1], kind: "PANORAMIC" }),
  })},
  { method: "DELETE", pattern: /^\/photos\/([^/]+)$/, handler: async (m) => {
    const photo = q.getPhoto(m[1]);
    if (!photo) throw new Error("Foto no encontrada.");
    q.deletePhoto(m[1]);
    await deletePhotoFile(photo.url);
    return { ok: true };
  }},

  { method: "POST", pattern: /^\/inspections\/([^/]+)\/calculate$/, handler: async (m) => ({ result: calculateAndPersist(m[1]) }) },
];

/** Implementación local de api(path, options) — ver public/app.js. */
export async function localApi(path, options = {}) {
  await ensureReady();
  const method = (options.method || "GET").toUpperCase();
  const cleanPath = path.split("?")[0];
  const body = options.body ? JSON.parse(options.body) : {};

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(cleanPath);
    if (!m) continue;
    return route.handler(m, body);
  }
  throw new Error(`Ruta no disponible sin conexión: ${method} ${path}`);
}

/** Genera el PDF del informe localmente y devuelve un Blob (ver localReportPdf.js). */
export async function localReportPdfBlob(inspectionId) {
  await ensureReady();
  return buildInspectionReportPdfLocal(inspectionId);
}

export { isNativePlatform };

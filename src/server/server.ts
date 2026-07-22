/**
 * Servidor HTTP de demostración — WABIM Bridges
 * ----------------------------------------------
 * Servidor mínimo, sin dependencias externas (solo módulos nativos de
 * Node.js), que expone:
 *   - Una API JSON en /api/*
 *   - El frontend estático (HTML/CSS/JS vanilla) en /public
 *
 * Este servidor existe para poder DEMOSTRAR Y PROBAR de punta a punta el
 * motor de cálculo WABIM (src/wabim) y el modelo de datos (prisma/schema.prisma,
 * espejado aquí en SQLite) sin necesidad de instalar paquetes npm — el
 * entorno en el que se construyó este proyecto no tiene acceso a internet.
 * La arquitectura objetivo (Next.js/NestJS + PostgreSQL) puede reemplazar
 * este archivo por completo reutilizando sin cambios src/wabim/*.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  getCatalog,
  updateSubCategoryCec,
  updateElementEc,
  updateSubElementIc,
  updatePathologyThresholds,
  listBridges,
  getBridge,
  createBridge,
  createInspection,
  updateInspectionResponsible,
  getInspection,
  addInspectionElement,
  addInspectionSubElement,
  addPathologyRecord,
  deletePathologyRecord,
  deleteInspectionSubElement,
  deleteInspectionElement,
  addPhoto,
  getPhoto,
  deletePhoto,
  findUserByEmail,
  listUsers,
} from "../db/queries.js";
import { calculateAndPersist } from "./wabimService.js";
import { main as runSeed } from "../db/seed.js";
import { buildInspectionReportPdf } from "./reportPdf.js";
import { verifyPassword, signToken, verifyToken, extractBearerToken } from "./auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "..", "public");
const UPLOADS_DIR = join(PUBLIC_DIR, "uploads");
const PORT = Number(process.env.PORT ?? 4000);

const DATA_URL_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Decodifica un data URL "data:image/xxx;base64,..." y lo guarda en disco bajo /uploads. */
async function saveDataUrlPhoto(dataUrl: string, subdir: string): Promise<string> {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Formato de imagen inválido: se esperaba un data URL 'data:image/...;base64,...'.");
  const [, mime, base64] = match;
  const ext = DATA_URL_EXT[mime];
  if (!ext) throw new Error(`Tipo de imagen no soportado: '${mime}'.`);
  const dir = join(UPLOADS_DIR, subdir);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, filename), Buffer.from(base64, "base64"));
  return `/uploads/${subdir}/${filename}`;
}

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: any) => void | Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

const routes: Route[] = [];

function addRoute(method: string, path: string, handler: Handler, opts: { auth?: boolean; admin?: boolean } = {}) {
  const paramNames: string[] = [];
  const patternStr = path.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  routes.push({
    method,
    pattern: new RegExp(`^${patternStr}$`),
    paramNames,
    handler,
    requiresAuth: opts.auth,
    requiresAdmin: opts.admin,
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

const MAX_BODY_BYTES = 15 * 1024 * 1024; // 15 MB — margen holgado para una foto de inspección en base64

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("La solicitud excede el tamaño máximo permitido (15 MB)."));
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("JSON inválido en el cuerpo de la solicitud."));
      }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Rutas: Autenticación
// ---------------------------------------------------------------------------
addRoute("POST", "/api/auth/login", async (req, res, _params, body) => {
  const { email, password } = body ?? {};
  const user = findUserByEmail(email ?? "");
  if (!user || !verifyPassword(password ?? "", user.password_hash)) {
    return sendJson(res, 401, { error: "Credenciales inválidas." });
  }
  const token = signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
  sendJson(res, 200, { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

addRoute(
  "GET",
  "/api/me",
  (req, res, _params, _body) => {
    const authUser = (req as any).authUser;
    sendJson(res, 200, { user: authUser });
  },
  { auth: true },
);

addRoute("GET", "/api/users", (req, res) => sendJson(res, 200, { users: listUsers() }), { auth: true });

// ---------------------------------------------------------------------------
// Rutas: Catálogo WABIM/INVÍAS
// ---------------------------------------------------------------------------
addRoute("GET", "/api/catalog", (req, res) => sendJson(res, 200, getCatalog()));

addRoute(
  "PUT",
  "/api/catalog/subcategories/:code",
  (req, res, params, body) => {
    updateSubCategoryCec(params.code, Number(body.cec));
    sendJson(res, 200, { ok: true });
  },
  { auth: true, admin: true },
);
addRoute(
  "PUT",
  "/api/catalog/elements/:code",
  (req, res, params, body) => {
    updateElementEc(params.code, Number(body.ec));
    sendJson(res, 200, { ok: true });
  },
  { auth: true, admin: true },
);
addRoute(
  "PUT",
  "/api/catalog/subelements/:code",
  (req, res, params, body) => {
    updateSubElementIc(params.code, Number(body.ic));
    sendJson(res, 200, { ok: true });
  },
  { auth: true, admin: true },
);
addRoute(
  "PUT",
  "/api/catalog/pathologies/:code",
  (req, res, params, body) => {
    updatePathologyThresholds(params.code, Number(body.lowMax), Number(body.highMin));
    sendJson(res, 200, { ok: true });
  },
  { auth: true, admin: true },
);

// ---------------------------------------------------------------------------
// Rutas: Catálogo oficial de puentes INVÍAS (datos.gov.co, dataset nsdj-ep2p)
// ---------------------------------------------------------------------------
// Proxy de solo lectura al portal de datos abiertos: se consulta en vivo (sin
// importar/cachear localmente) para no duplicar ni desactualizar el catálogo
// oficial; el usuario elige un resultado y la app solo prellena el formulario
// de registro de puente, dejando los campos editables para completar/corregir.
const INVIAS_CATALOG_URL = "https://www.datos.gov.co/resource/nsdj-ep2p.json";

addRoute("GET", "/api/invias-catalog/search", async (req, res, _params, _body) => {
  const query = new URL(req.url ?? "", `http://localhost:${PORT}`).searchParams.get("q")?.trim();
  if (!query) return sendJson(res, 200, { results: [] });
  try {
    const apiUrl = `${INVIAS_CATALOG_URL}?$q=${encodeURIComponent(query)}&$limit=15`;
    const resp = await fetch(apiUrl);
    if (!resp.ok) throw new Error(`INVÍAS respondió ${resp.status}`);
    const rows = (await resp.json()) as any[];
    const results = rows.map((r) => ({
      nombre: r.nombre ?? null,
      carretera: r.carretera ?? null,
      via: r.via ?? null,
      administrador: r.administrador ?? null,
      luces: r.luces != null ? Number(r.luces) : null,
      luzTotal: r.luz_total != null ? Number(r.luz_total) : null,
      fechaConstruccion: r.fecha_de_construcci_n ?? null,
      posteReferencia: r.poste_de_referencia ?? null,
      distancia: r.distancia != null ? Number(r.distancia) : null,
      latitude: r.point?.coordinates?.[1] ?? null,
      longitude: r.point?.coordinates?.[0] ?? null,
    }));
    sendJson(res, 200, { results });
  } catch (err: any) {
    sendJson(res, 502, { error: `No se pudo consultar el catálogo INVÍAS: ${err.message ?? err}` });
  }
});

// ---------------------------------------------------------------------------
// Rutas: Puentes
// ---------------------------------------------------------------------------
addRoute("GET", "/api/bridges", (req, res) => sendJson(res, 200, { bridges: listBridges() }));

addRoute("POST", "/api/bridges", (req, res, _params, body) => {
  const bridge = createBridge(body);
  sendJson(res, 201, { bridge });
});

addRoute("GET", "/api/bridges/:id", (req, res, params) => {
  const bridge = getBridge(params.id);
  if (!bridge) return sendJson(res, 404, { error: "Puente no encontrado." });
  sendJson(res, 200, { bridge });
});

addRoute("POST", "/api/bridges/:id/inspections", (req, res, params, body) => {
  const inspection = createInspection(params.id, body);
  sendJson(res, 201, { inspection });
});

// ---------------------------------------------------------------------------
// Rutas: Inspecciones (captura de campo)
// ---------------------------------------------------------------------------
addRoute("GET", "/api/inspections/:id", (req, res, params) => {
  const inspection = getInspection(params.id);
  if (!inspection) return sendJson(res, 404, { error: "Inspección no encontrada." });
  sendJson(res, 200, { inspection });
});

addRoute("PATCH", "/api/inspections/:id", (req, res, params, body) => {
  const inspection = updateInspectionResponsible(params.id, body);
  sendJson(res, 200, { inspection });
});

addRoute("POST", "/api/inspections/:id/elements", (req, res, params, body) => {
  const id = addInspectionElement(params.id, body.elementCode, body.label);
  sendJson(res, 201, { id });
});

addRoute("DELETE", "/api/inspection-elements/:id", (req, res, params) => {
  deleteInspectionElement(params.id);
  sendJson(res, 200, { ok: true });
});

addRoute("POST", "/api/inspection-elements/:id/subelements", (req, res, params, body) => {
  const id = addInspectionSubElement(params.id, body.subElementCode, Number(body.ic ?? 0), body.label);
  sendJson(res, 201, { id });
});

addRoute("DELETE", "/api/inspection-subelements/:id", (req, res, params) => {
  deleteInspectionSubElement(params.id);
  sendJson(res, 200, { ok: true });
});

addRoute("POST", "/api/inspection-subelements/:id/pathologies", (req, res, params, body) => {
  const id = addPathologyRecord(params.id, body.pathologyCode, Number(body.measuredValue), Number(body.totalMeasure), body);
  sendJson(res, 201, { id });
});

addRoute("DELETE", "/api/pathology-records/:id", (req, res, params) => {
  deletePathologyRecord(params.id);
  sendJson(res, 200, { ok: true });
});

// ---------------------------------------------------------------------------
// Rutas: Fotos de inspección
// ---------------------------------------------------------------------------
addRoute("POST", "/api/inspection-elements/:id/photos", async (req, res, params, body) => {
  try {
    const url = await saveDataUrlPhoto(body.dataUrl, params.id);
    const photo = addPhoto({
      url,
      caption: body.caption,
      inspectionElementId: params.id,
      pathologyRecordId: body.pathologyRecordId || null,
    });
    sendJson(res, 201, { photo });
  } catch (err: any) {
    sendJson(res, 400, { error: err.message ?? String(err) });
  }
});

// Fotos panorámicas: vista general de la estructura, ligadas directamente a
// la inspección (sin elemento/patología) — para el registro documental y la
// portada del informe PDF, a diferencia de las fotos de daño puntual arriba.
addRoute("POST", "/api/inspections/:id/photos", async (req, res, params, body) => {
  try {
    const url = await saveDataUrlPhoto(body.dataUrl, params.id);
    const photo = addPhoto({
      url,
      caption: body.caption,
      inspectionId: params.id,
      kind: "PANORAMIC",
    });
    sendJson(res, 201, { photo });
  } catch (err: any) {
    sendJson(res, 400, { error: err.message ?? String(err) });
  }
});

addRoute("DELETE", "/api/photos/:id", async (req, res, params) => {
  const photo = getPhoto(params.id);
  if (!photo) return sendJson(res, 404, { error: "Foto no encontrada." });
  deletePhoto(params.id);
  const filePath = join(PUBLIC_DIR, photo.url);
  try {
    await unlink(filePath);
  } catch {
    // El archivo ya no existe en disco; el registro en BD ya se borró, no es un error fatal.
  }
  sendJson(res, 200, { ok: true });
});

addRoute("GET", "/api/inspections/:id/report.pdf", (req, res, params) => {
  try {
    const doc = buildInspectionReportPdf(params.id);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="informe-inspeccion-${params.id}.pdf"`,
    });
    doc.pipe(res);
  } catch (err: any) {
    sendJson(res, 404, { error: err.message ?? String(err) });
  }
});

addRoute("POST", "/api/inspections/:id/calculate", (req, res, params) => {
  try {
    const result = calculateAndPersist(params.id);
    sendJson(res, 200, { result });
  } catch (err: any) {
    sendJson(res, 400, { error: err.message ?? String(err) });
  }
});

// ---------------------------------------------------------------------------
// Servidor HTTP: enrutamiento + archivos estáticos
// ---------------------------------------------------------------------------
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  let urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = normalize(join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("No encontrado");
    return;
  }
  const ext = extname(filePath);
  const contents = await readFile(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(contents);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (!url.pathname.startsWith("/api/")) {
      return void (await serveStatic(req, res));
    }

    const method = req.method ?? "GET";
    for (const route of routes) {
      if (route.method !== method) continue;
      const match = route.pattern.exec(url.pathname);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, idx) => (params[name] = match[idx + 1]));

      if (route.requiresAuth) {
        const token = extractBearerToken(req.headers.authorization);
        const payload = verifyToken(token);
        if (!payload) return sendJson(res, 401, { error: "No autenticado." });
        if (route.requiresAdmin && payload.role !== "ADMIN") {
          return sendJson(res, 403, { error: "Se requiere rol de administrador." });
        }
        (req as any).authUser = payload;
      }

      const body = method === "POST" || method === "PUT" || method === "PATCH" ? await readBody(req) : {};
      await route.handler(req, res, params, body);
      return;
    }

    sendJson(res, 404, { error: `Ruta no encontrada: ${method} ${url.pathname}` });
  } catch (err: any) {
    console.error(err);
    sendJson(res, 500, { error: err.message ?? "Error interno del servidor." });
  }
});

// Auto-siembra: en hosting sin disco persistente (p.ej. el nivel gratis de
// Render) el archivo SQLite se reinicia vacío en cada despliegue/reinicio.
// Para que la app funcione igual sin depender de correr "npm run seed" a
// mano cada vez, si arranca sin puentes se siembra automáticamente aquí.
function autoSeedIfEmpty() {
  if (listBridges().length > 0) return;
  console.log("Base de datos vacía — cargando catálogo y datos de ejemplo automáticamente...");
  try {
    runSeed();
  } catch (err) {
    console.error("Fallo la auto-siembra:", err);
  }
}
autoSeedIfEmpty();

server.listen(PORT, () => {
  console.log(`\n  WABIM Bridges — servidor de demostración`);
  console.log(`  ---------------------------------------`);
  console.log(`  Interfaz web:  http://localhost:${PORT}`);
  console.log(`  API:           http://localhost:${PORT}/api`);
  console.log(`  Base de datos: ${join(__dirname, "..", "..", "data", "wabim.sqlite")}`);
  console.log(`\n  Si es la primera vez que ejecutas el proyecto, corre "npm run seed" en otra terminal.\n`);
});

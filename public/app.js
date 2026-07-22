// Utilidades compartidas del frontend (vanilla JS, sin dependencias / sin build step).
// El token de sesión se guarda en localStorage: esta es una aplicación web real
// servida por nuestro propio servidor Node (no un "artifact" de Claude.ai), así
// que el uso de localStorage aquí es el estándar habitual para una SPA simple.

const AUTH_KEY = "wabim_auth";

function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function setAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

function requireAuthOrRedirect() {
  const auth = getAuth();
  if (!auth) {
    window.location.href = "/login.html";
    return null;
  }
  return auth;
}

async function api(path, options = {}) {
  const auth = getAuth();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }
  return data;
}

function renderNav(active) {
  const auth = getAuth();
  const el = document.getElementById("nav");
  if (!el) return;
  el.innerHTML = `
    <div class="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
      <a href="/index.html" class="flex items-center gap-2 font-semibold text-slate-800">
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white text-sm">W</span>
        <span>Inspección Visual de Puentes y Pontones WABIM</span>
      </a>
      <div class="flex items-center gap-4 text-sm">
        <a href="/index.html" class="${active === "home" ? "text-indigo-600 font-medium" : "text-slate-600"} hover:text-indigo-600">Inventario</a>
        <a href="/admin.html" class="${active === "admin" ? "text-indigo-600 font-medium" : "text-slate-600"} hover:text-indigo-600">Coeficientes WABIM</a>
        ${
          auth
            ? `<span class="text-slate-500">${auth.user.name} (${auth.user.role})</span>
               <button id="logoutBtn" class="text-slate-500 hover:text-red-600">Salir</button>`
            : `<a href="/login.html" class="text-slate-600 hover:text-indigo-600">Ingresar</a>`
        }
      </div>
    </div>
  `;
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearAuth();
      window.location.href = "/login.html";
    });
  }
}

// Logos institucionales oficiales, descargados de los sitios de cada
// institución (ver public/assets/logos/). Altura uniforme + object-contain
// para no distorsionar proporciones distintas (apaisado, cuadrado, etc.).
function renderFooter() {
  const el = document.getElementById("footer");
  if (!el) return;
  el.innerHTML = `
    <div class="max-w-6xl mx-auto px-4 py-8 mt-12 border-t border-slate-200 text-xs text-slate-500">
      <div class="text-slate-400 uppercase tracking-wide font-medium mb-3">Créditos institucionales</div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="flex items-center gap-3">
          <img src="/assets/logos/invias.png" alt="INVÍAS" class="h-10 w-16 shrink-0 object-contain" />
          <span class="text-slate-600">Instituto Nacional de Vías (INVÍAS), Colombia</span>
        </div>
        <div class="flex items-center gap-3">
          <img src="/assets/logos/utp.png" alt="Universidad Tecnológica de Pereira" class="h-10 w-10 shrink-0 object-contain" />
          <span class="text-slate-600">Universidad Tecnológica de Pereira</span>
        </div>
        <div class="flex items-center gap-3">
          <img src="/assets/logos/unilibre-pereira.svg" alt="Universidad Libre Seccional Pereira" class="h-10 w-16 shrink-0 object-contain" />
          <span class="text-slate-600">Universidad Libre Seccional Pereira</span>
        </div>
      </div>
      <div class="text-slate-400 uppercase tracking-wide font-medium mb-2">Metodología y fuentes</div>
      <p class="mb-1">
        Amariles-López, C.C. &amp; Osorio-Gómez, C.C. (2023). <em>Weighted Average Bridge Inspection Methodology (WABIM)</em>.
        Revista DYNA, 90(225), 55-63.
        <a class="underline hover:text-indigo-600" href="https://doi.org/10.15446/dyna.v90n225.104694" target="_blank" rel="noopener">https://doi.org/10.15446/dyna.v90n225.104694</a>
      </p>
      <p>
        INVÍAS / Universidad Nacional de Colombia (2006). <em>Manual para la Inspección Visual de Puentes y Pontones</em>. Convenio Interadministrativo 587-03.
      </p>
    </div>
  `;
}

function fmtPct(n) {
  return `${Number(n).toFixed(2)}%`;
}

function conditionBadge(condition, label) {
  const colors = {
    SIN_DETERIORO: "bg-green-100 text-green-800 border-green-300",
    DETERIORO_BAJO: "bg-yellow-100 text-yellow-800 border-yellow-300",
    DETERIORO_MODERADO: "bg-orange-100 text-orange-800 border-orange-300",
    DETERIORO_MEDIO_ALTO: "bg-red-100 text-red-800 border-red-300",
    DETERIORO_ALTO: "bg-red-200 text-red-900 border-red-400",
  };
  const cls = colors[condition] || "bg-slate-100 text-slate-800 border-slate-300";
  return `<span class="inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${cls}">${label}</span>`;
}

// Bandas de color por porcentaje de Grado de Afectación (Tabla 4 WABIM,
// mismos rangos y colores que classifyCondition en src/wabim/engine.ts).
// Se reutiliza para colorear cualquier barra de % (elemento, subcategoría o
// total), ya que la tabla de clasificación es una escala de severidad
// genérica sobre un porcentaje, no exclusiva del D.T.A. total.
const WABIM_BANDS = [
  { max: 10, hex: "#22c55e" },
  { max: 40, hex: "#eab308" },
  { max: 50, hex: "#f97316" },
  { max: 90, hex: "#ef4444" },
  { max: 100, hex: "#b91c1c" },
];
function wabimBarColor(pct) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  return (WABIM_BANDS.find((b) => clamped <= b.max) || WABIM_BANDS[WABIM_BANDS.length - 1]).hex;
}

// Una fila de "gráfica de barras": etiqueta + barra horizontal + porcentaje,
// equivalente visual a los gráficos de barras de la hoja "Grado de
// afectación" del Excel de referencia, sin depender de ninguna librería de
// gráficas externa (coherente con el resto de la app: HTML/CSS vanilla).
function barRow(label, pct, { sublabel } = {}) {
  const width = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = wabimBarColor(pct);
  return `
    <div class="flex items-center gap-3 text-sm py-1">
      <div class="w-40 sm:w-48 shrink-0 text-slate-600 truncate" title="${escapeHtml(label)}">
        ${escapeHtml(label)}${sublabel ? `<span class="text-slate-400"> ${escapeHtml(sublabel)}</span>` : ""}
      </div>
      <div class="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full rounded-full" style="width:${width}%;background-color:${color};"></div>
      </div>
      <div class="w-20 shrink-0 text-right font-medium text-slate-700 tabular-nums">${fmtPct(pct)}</div>
    </div>
  `;
}

// Tarjeta que agrupa varias barRow bajo un título, como cada bloque de la
// hoja "Grado de afectación" (p.ej. "Superficie y equipamiento").
function barChartCard(title, subtitle, rowsHtml) {
  return `
    <div class="bg-white rounded-xl border border-slate-200 p-5">
      <div class="flex items-baseline justify-between mb-2">
        <h3 class="font-medium text-slate-800">${escapeHtml(title)}</h3>
        ${subtitle ? `<span class="text-xs text-slate-400">${escapeHtml(subtitle)}</span>` : ""}
      </div>
      <div class="space-y-1">${rowsHtml}</div>
    </div>
  `;
}

// Redimensiona la foto en el navegador antes de subirla (máx. 1600px de lado
// mayor, JPEG calidad 0.8) para no enviar fotos de cámara de varios MB tal
// cual: el body del servidor tiene un límite de 15MB y sin esto una sola
// foto en alta resolución podría acercarse a ese límite.
function resizeImageToDataUrl(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo leer la imagen."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Sube una foto (redimensionada) asociada a un elemento inspeccionado, opcionalmente a una patología específica. */
async function uploadPhoto(inspectionElementId, file, { pathologyRecordId, caption } = {}) {
  const dataUrl = await resizeImageToDataUrl(file);
  return api(`/inspection-elements/${inspectionElementId}/photos`, {
    method: "POST",
    body: JSON.stringify({ dataUrl, pathologyRecordId: pathologyRecordId ?? null, caption: caption ?? null }),
  });
}

/** Galería compacta de miniaturas con botón de eliminar por foto. */
function photoGallery(photos) {
  if (!photos || !photos.length) return "";
  return `<div class="flex flex-wrap gap-1.5 mt-1.5">
    ${photos
      .map(
        (p) => `
      <div class="relative group">
        <img src="${p.url}" class="h-14 w-14 object-cover rounded-lg border border-slate-200" alt="${escapeHtml(p.caption || "Foto de inspección")}" />
        <button class="delete-photo-btn absolute -top-1.5 -right-1.5 bg-white border border-slate-300 rounded-full w-4 h-4 text-[10px] leading-none text-red-500 opacity-0 group-hover:opacity-100 transition" data-id="${p.id}" title="Eliminar foto">✕</button>
      </div>
    `,
      )
      .join("")}
  </div>`;
}

/** Botón "+ foto" + input file oculto (con captura de cámara en móvil) ligado a un data-attribute set. */
function photoUploadControl(dataAttrs) {
  const attrs = Object.entries(dataAttrs)
    .map(([k, v]) => `data-${k}="${v}"`)
    .join(" ");
  return `
    <button type="button" class="add-photo-btn text-xs text-indigo-600 hover:underline" ${attrs}>+ foto</button>
    <input type="file" accept="image/*" capture="environment" class="hidden photo-input" ${attrs} />
  `;
}

// ---------------------------------------------------------------------------
// Catálogos cerrados del Manual INVÍAS (2006) usados en menús desplegables.
// ---------------------------------------------------------------------------

// Tabla 2 — Tipo de Puente según estructuración transversal
const BRIDGE_TYPE_TRANSVERSE = [
  "Losa sobre vigas",
  "Losa simplemente apoyada",
  "Viga Cajón",
  "Armadura de paso superior",
  "Armadura de paso inferior",
  "Arco Superior",
  "Arco Inferior",
];
// Tabla 3 — Tipo de Puente según estructuración longitudinal
const BRIDGE_TYPE_LONGITUDINAL = [
  "Vigas simplemente apoyadas",
  "Vigas continuas",
  "Puente colgante",
  "Puente atirantado",
  "Pórtico",
  "Box culvert",
];
// Tabla 8 — Material de aletas y estribos (única tabla de materiales del manual)
const BRIDGE_MATERIALS = ["Mampostería", "Concreto ciclópeo", "Concreto reforzado", "Acero", "Acero y concreto", "Tierra armada"];

const OTHER_VALUE = "__OTHER__";

/**
 * <select> con las opciones cerradas del manual + "Otro (especificar)", que revela un
 * input de texto libre. `options` acepta strings (value=label=el mismo texto) u objetos
 * {value, label} cuando el código y la etiqueta visible difieren (p.ej. ubicaciones "CD").
 */
function selectWithOther(name, options, { otherName, placeholder = "Especifica cuál...", required = false } = {}) {
  const otherFieldName = otherName ?? `${name}Other`;
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return `
    <select name="${name}" class="select-with-other mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" data-other-name="${otherFieldName}" ${required ? "required" : ""}>
      <option value="">Selecciona...</option>
      ${opts.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}
      <option value="${OTHER_VALUE}">Otro (especificar)</option>
    </select>
    <input type="text" name="${otherFieldName}" class="other-input hidden mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="${escapeHtml(placeholder)}" />
  `;
}

/** Muestra/oculta el input de texto libre según si el <select> tiene "Otro" elegido. Llamar tras insertar el HTML en el DOM. */
function bindSelectsWithOther(root = document) {
  root.querySelectorAll(".select-with-other").forEach((select) => {
    const otherInput = select.parentElement.querySelector(`input[name="${select.dataset.otherName}"]`);
    const sync = () => {
      const isOther = select.value === OTHER_VALUE;
      otherInput.classList.toggle("hidden", !isOther);
      if (!isOther) otherInput.value = "";
    };
    select.addEventListener("change", sync);
    sync();
  });
}

/** Antes de enviar el payload: si el <select> quedó en "Otro", sustituye el valor por lo escrito en el campo libre. */
function resolveSelectsWithOther(payload, fields) {
  for (const { select, other } of fields) {
    if (payload[select] === OTHER_VALUE) payload[select] = payload[other] || "";
    delete payload[other];
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Los modales se muestran/ocultan alternando "hidden" y "flex". Ambas clases
// deben alternarse juntas: dejar "flex" puesto al ocultar (o viceversa) hace
// que el modal no se cierre, porque las dos reglas CSS quedan aplicadas a la
// vez y el resultado depende del orden/especificidad en vez de la intención.
function openModal(el) {
  el.classList.remove("hidden");
  el.classList.add("flex");
}
function closeModal(el) {
  el.classList.add("hidden");
  el.classList.remove("flex");
}

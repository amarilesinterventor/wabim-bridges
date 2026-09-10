// Puerto a pdf-lib (navegador) de src/server/reportPdf.ts. pdfkit no corre
// en un WebView (depende de node:fs y de un modelo de "flujo" de texto que
// no existe en pdf-lib), así que aquí se reimplementan a mano los mismos
// ayudantes de maquetación (título de sección, grilla clave/valor, barra de
// %, miniaturas de foto, banner panorámico) sobre la API de pdf-lib, con el
// mismo diseño visual que la versión servidor.
//
// Diferencia clave de coordenadas: pdf-lib ubica (0,0) en la esquina
// INFERIOR izquierda de la página (al revés que el modelo "de arriba hacia
// abajo" de pdfkit). Todo este archivo trabaja internamente con un cursor
// `y` medido "desde arriba" (igual que pdfkit, para poder razonar con la
// misma lógica que reportPdf.ts) y solo se convierte a la coordenada real de
// pdf-lib (`page.getHeight() - y`) en el momento de dibujar.
import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, clip, endPath, rectangle } from "/vendor/pdf-lib.esm.min.js";
import { getInspection, getBridge, getCatalog } from "./localQueries.js";

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 puntos
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const BANDS = [
  { max: 10, hex: "#22c55e" },
  { max: 40, hex: "#eab308" },
  { max: 50, hex: "#f97316" },
  { max: 90, hex: "#ef4444" },
  { max: 100, hex: "#b91c1c" },
];
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function bandColor(pct) {
  const c = Math.max(0, Math.min(100, Number(pct) || 0));
  return hexToRgb((BANDS.find((b) => c <= b.max) ?? BANDS[BANDS.length - 1]).hex);
}
function fmtPct(n) {
  return n == null ? "—" : `${Number(n).toFixed(2)}%`;
}
const CONDITION_LABEL = {
  SIN_DETERIORO: "Sin deterioro",
  DETERIORO_BAJO: "Deterioro bajo",
  DETERIORO_MODERADO: "Deterioro moderado",
  DETERIORO_MEDIO_ALTO: "Deterioro medio-alto",
  DETERIORO_ALTO: "Deterioro alto — susceptible de colapso",
};

const SLATE_800 = hexToRgb("#1e293b");
const SLATE_700 = hexToRgb("#334155");
const SLATE_600 = hexToRgb("#475569");
const SLATE_500 = hexToRgb("#64748b");
const SLATE_400 = hexToRgb("#94a3b8");
const SLATE_200 = hexToRgb("#e2e8f0");
const SLATE_300 = hexToRgb("#cbd5e1");
const INK = hexToRgb("#0f172a");
const WHITE = rgb(1, 1, 1);

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function embedImageAuto(pdfDoc, bytes, url) {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return pdfDoc.embedPng(bytes);
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return pdfDoc.embedJpg(bytes);
  // Fotos de cámara: casi siempre JPEG aunque la URL no lo diga (capacitor://, blob:).
  try {
    return await pdfDoc.embedJpg(bytes);
  } catch {
    return pdfDoc.embedPng(bytes);
  }
}

/** Envuelve texto a un ancho máximo midiendo con la fuente real (pdf-lib no lo hace solo). */
function wrapText(text, font, size, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

class Builder {
  constructor(pdfDoc, fonts) {
    this.pdfDoc = pdfDoc;
    this.fonts = fonts; // { regular, bold }
    this.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages = [this.page];
    this.y = PAGE_MARGIN;
  }

  ensureSpace(needed) {
    if (this.y + needed > PAGE_HEIGHT - PAGE_MARGIN) {
      this.page = this.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.pages.push(this.page);
      this.y = PAGE_MARGIN;
    }
  }

  /** Dibuja texto envuelto a `width` en (x, this.y) y avanza this.y. Devuelve la altura usada. */
  text(str, { x = PAGE_MARGIN, width = CONTENT_WIDTH, size = 10, font, color = INK, lineHeight = 1.35 } = {}) {
    const f = font ?? this.fonts.regular;
    const lines = wrapText(str, f, size, width);
    const lh = size * lineHeight;
    this.ensureSpace(lines.length * lh);
    for (const line of lines) {
      this.page.drawText(line, { x, y: PAGE_HEIGHT - this.y - size, size, font: f, color });
      this.y += lh;
    }
    return lines.length * lh;
  }

  rect(x, y, width, height, color) {
    this.page.drawRectangle({ x, y: PAGE_HEIGHT - y - height, width, height, color });
  }

  rectOutline(x, y, width, height, color, borderWidth = 1) {
    this.page.drawRectangle({ x, y: PAGE_HEIGHT - y - height, width, height, borderColor: color, borderWidth });
  }

  hr(y, color = SLATE_200) {
    this.page.drawLine({ start: { x: PAGE_MARGIN, y: PAGE_HEIGHT - y }, end: { x: PAGE_MARGIN + CONTENT_WIDTH, y: PAGE_HEIGHT - y }, color, thickness: 1 });
  }
}

function sectionTitle(b, title) {
  b.ensureSpace(30);
  b.y += 6;
  b.text(title, { size: 13, font: b.fonts.bold, color: SLATE_800 });
  b.hr(b.y);
  b.y += 10;
}

function keyValueGrid(b, pairs) {
  const colWidth = CONTENT_WIDTH / 2;
  let col = 0;
  let rowY = b.y;
  for (const [label, value] of pairs) {
    b.ensureSpace(28);
    const x = PAGE_MARGIN + col * colWidth;
    if (col === 0) rowY = b.y;
    b.y = rowY;
    b.text(label.toUpperCase(), { x, width: colWidth - 10, size: 8, color: SLATE_400, lineHeight: 1.2 });
    b.text(value || "—", { x, width: colWidth - 10, size: 10, color: INK, lineHeight: 1.2 });
    if (col === 0) {
      col = 1;
      b.y = rowY;
    } else {
      col = 0;
      b.y = Math.max(b.y, rowY) + 8;
    }
  }
  if (col === 1) b.y += 20;
}

function barRow(b, label, pct, { indent = 0, sub } = {}) {
  b.ensureSpace(20);
  const labelWidth = 190 - indent;
  const barX = PAGE_MARGIN + indent + labelWidth + 6;
  const barWidth = CONTENT_WIDTH - indent - labelWidth - 60;
  const rowTop = b.y;

  b.text(label + (sub ? `  ${sub}` : ""), { x: PAGE_MARGIN + indent, width: labelWidth, size: 9, color: SLATE_700, lineHeight: 1.2 });
  const afterLabelY = b.y;

  const barY = rowTop + 3;
  b.rect(barX, barY, barWidth, 8, SLATE_200);
  const w = Math.max(3, (Math.max(0, Math.min(100, pct)) / 100) * barWidth);
  b.rect(barX, barY, w, 8, bandColor(pct));
  b.page.drawText(fmtPct(pct), {
    x: barX + barWidth + 8,
    y: PAGE_HEIGHT - (rowTop + 9),
    size: 9,
    font: b.fonts.regular,
    color: INK,
  });

  b.y = Math.max(afterLabelY, rowTop + 16);
}

async function photoThumbRow(b, photos, indent, thumbSize = 150) {
  if (!photos?.length) return;
  const gap = 15;
  const startX = PAGE_MARGIN + indent;
  const availWidth = CONTENT_WIDTH - indent;
  const perRow = Math.max(1, Math.floor((availWidth + gap) / (thumbSize + gap)));

  b.ensureSpace(thumbSize + 10);
  let rowTop = b.y + 2;
  let col = 0;
  for (const p of photos) {
    if (col >= perRow) {
      b.y = rowTop + thumbSize + 6;
      b.ensureSpace(thumbSize + 10);
      rowTop = b.y;
      col = 0;
    }
    const x = startX + col * (thumbSize + gap);
    try {
      const bytes = await fetchBytes(p.url);
      const img = await embedImageAuto(b.pdfDoc, bytes, p.url);
      // "contain": conserva proporción, cabe dentro del cuadro sin recortar.
      const scale = Math.min(thumbSize / img.width, thumbSize / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      b.page.drawImage(img, { x: x + (thumbSize - w) / 2, y: PAGE_HEIGHT - rowTop - (thumbSize + h) / 2, width: w, height: h });
    } catch {
      // Si una foto puntual no se puede leer/decodificar, se omite sin interrumpir el informe.
    }
    col++;
  }
  b.y = rowTop + thumbSize + 10;
}

async function addLogosHeader(b) {
  const y = PAGE_MARGIN - 10;
  const targetHeight = 26;
  const gap = 14;
  let x = PAGE_MARGIN;
  const logoPaths = ["/assets/logos/invias.png", "/assets/logos/utp.png", "/assets/logos/unilibre-pereira.png"];
  for (const logoPath of logoPaths) {
    try {
      const bytes = await fetchBytes(logoPath);
      const img = await b.pdfDoc.embedPng(bytes);
      const width = (img.width / img.height) * targetHeight;
      b.page.drawImage(img, { x, y: PAGE_HEIGHT - y - targetHeight, width, height: targetHeight });
      x += width + gap;
    } catch {
      // Un logo puntual que no se pueda cargar no debe romper el informe.
    }
  }
}

async function addPanoramicBanner(b, photoUrl, bridge) {
  try {
    const bannerHeight = 170;
    b.ensureSpace(bannerHeight + 20);
    const y = b.y;
    const bytes = await fetchBytes(photoUrl);
    const img = await embedImageAuto(b.pdfDoc, bytes, photoUrl);
    // "cover": escala para llenar el recuadro completo, recortando el sobrante.
    const scale = Math.max(CONTENT_WIDTH / img.width, bannerHeight / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const dx = PAGE_MARGIN - (w - CONTENT_WIDTH) / 2;
    const dy = y - (h - bannerHeight) / 2;
    const boxBottomY = PAGE_HEIGHT - y - bannerHeight;
    b.page.drawRectangle({ x: PAGE_MARGIN, y: boxBottomY, width: CONTENT_WIDTH, height: bannerHeight, color: WHITE });
    // "cover" escala la imagen para llenar el recuadro, así que casi siempre
    // sobra por los lados/arriba-abajo — sin recortar de verdad (clip), ese
    // sobrante se dibuja encima del contenido vecino (título, texto), igual
    // que se detectó y corrigió en la versión servidor (reportPdf.ts).
    b.page.pushOperators(pushGraphicsState(), rectangle(PAGE_MARGIN, boxBottomY, CONTENT_WIDTH, bannerHeight), clip(), endPath());
    b.page.drawImage(img, { x: dx, y: PAGE_HEIGHT - dy - h, width: w, height: h });
    b.page.pushOperators(popGraphicsState());
    b.rectOutline(PAGE_MARGIN, y, CONTENT_WIDTH, bannerHeight, SLATE_300, 1);

    const barHeight = 34;
    b.page.drawRectangle({
      x: PAGE_MARGIN, y: PAGE_HEIGHT - y - bannerHeight, width: CONTENT_WIDTH, height: barHeight,
      color: hexToRgb("#0f172a"), opacity: 0.72,
    });
    b.page.drawText(bridge?.name ?? "—", { x: PAGE_MARGIN + 10, y: PAGE_HEIGHT - (y + bannerHeight - barHeight + 18), size: 12, font: b.fonts.bold, color: WHITE });
    b.page.drawText(`${bridge?.code ?? "—"} · ${bridge?.municipality ?? "—"}, ${bridge?.department ?? "—"}`, {
      x: PAGE_MARGIN + 10, y: PAGE_HEIGHT - (y + bannerHeight - barHeight + 30), size: 8.5, font: b.fonts.regular, color: hexToRgb("#e2e8f0"),
    });

    b.y = y + bannerHeight + 12;
  } catch {
    // Si la foto no se puede leer/decodificar, se omite el banner sin romper el informe.
  }
}

export async function buildInspectionReportPdfLocal(inspectionId) {
  const insp = getInspection(inspectionId);
  if (!insp) throw new Error(`Inspección no encontrada: ${inspectionId}`);
  const bridge = getBridge(insp.bridge_id);
  const catalog = getCatalog();
  const subCategoryName = new Map(catalog.subCategories.map((s) => [s.code, s.name]));

  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const b = new Builder(pdfDoc, fonts);

  // Fotos: en la BD local se guardan como rutas relativas estables (ver
  // storage.js); aquí se resuelven a URLs vivas justo antes de incrustarlas.
  const { resolvePhotoUrl } = await import("./storage.js");
  async function resolve(photos) {
    if (!photos?.length) return;
    for (const p of photos) p.url = (await resolvePhotoUrl(p.url)) ?? p.url;
  }
  await resolve(insp.panoramicPhotos);
  for (const el of insp.elements) {
    await resolve(el.photos);
    for (const se of el.subElements) for (const pa of se.pathologies) await resolve(pa.photos);
  }
  if (insp.signature_url) insp.signature_url = (await resolvePhotoUrl(insp.signature_url)) ?? insp.signature_url;

  // --- Encabezado ---
  await addLogosHeader(b);
  b.y += 40;
  b.text("Informe de Inspección Visual de Puente", { size: 18, font: fonts.bold, color: SLATE_800 });
  b.text("Metodología WABIM (Amariles-López & Osorio-Gómez, 2023) + Manual para la Inspección Visual de Puentes y Pontones, INVÍAS (2006)", { size: 10, color: SLATE_500 });
  b.y += 8;

  const panoramicPhotos = insp.panoramicPhotos ?? [];
  if (panoramicPhotos[0]) await addPanoramicBanner(b, panoramicPhotos[0].url, bridge);
  if (panoramicPhotos.length > 1) {
    b.text("Otras vistas panorámicas", { size: 8, color: SLATE_400 });
    await photoThumbRow(b, panoramicPhotos.slice(1), 0);
    b.y += 4;
  }

  // --- Datos generales del puente ---
  sectionTitle(b, "Datos generales del puente");
  keyValueGrid(b, [
    ["Nombre", bridge?.name ?? "—"],
    ["Código", bridge?.code ?? "—"],
    ["Municipio / Departamento", `${bridge?.municipality ?? "—"} / ${bridge?.department ?? "—"}`],
    ["Coordenadas", bridge?.latitude != null ? `${bridge.latitude}, ${bridge.longitude}` : "—"],
    ["Tipo transversal", bridge?.structural_type_transverse ?? "—"],
    ["Tipo longitudinal", bridge?.structural_type_longitudinal ?? "—"],
    ["Longitud / Ancho", `${bridge?.length ?? "—"} m / ${bridge?.width ?? "—"} m`],
    ["# de luces", String(bridge?.number_of_spans ?? "—")],
    ["Material", bridge?.material ?? "—"],
    ["Año de construcción", String(bridge?.construction_year ?? "—")],
    ["Propietario", bridge?.owner ?? "—"],
    ["Nombre / Código de vía", `${bridge?.route ?? "—"} / ${bridge?.route_code ?? "—"}`],
    ["Km (PR) / Esviajamiento", `${bridge?.km ?? "—"} / ${bridge?.skew != null ? bridge.skew + "°" : "—"}`],
    ["Vía en concesión", bridge?.concession == null ? "—" : bridge.concession ? "Sí" : "No"],
  ]);

  // --- Datos de la inspección ---
  sectionTitle(b, "Datos de la inspección");
  keyValueGrid(b, [
    ["Fecha programada", insp.scheduled_date ?? "—"],
    ["Fecha ejecutada", insp.executed_date ?? "—"],
    ["Clima", insp.weather ?? "—"],
    ["Equipo utilizado", insp.equipment ?? "—"],
    ["Estado", insp.status ?? "—"],
    ["Prioridad", insp.priority ?? "—"],
    ["Responsable (levantó)", insp.responsible_name ?? "—"],
    ["Cédula del responsable", insp.responsible_id_number ?? "—"],
  ]);
  if (insp.notes) {
    b.text("NOTAS", { size: 8, color: SLATE_400 });
    b.text(insp.notes, { size: 10, color: INK });
    b.y += 6;
  }
  if (insp.signature_url) {
    try {
      b.ensureSpace(90);
      b.text("FIRMA DEL RESPONSABLE", { size: 8, color: SLATE_400 });
      const y = b.y + 2;
      const bytes = await fetchBytes(insp.signature_url);
      const img = await embedImageAuto(pdfDoc, bytes, insp.signature_url);
      const scale = Math.min(180 / img.width, 60 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      b.page.drawImage(img, { x: PAGE_MARGIN, y: PAGE_HEIGHT - y - h, width: w, height: h });
      b.page.drawLine({ start: { x: PAGE_MARGIN, y: PAGE_HEIGHT - y - 64 }, end: { x: PAGE_MARGIN + 180, y: PAGE_HEIGHT - y - 64 }, color: SLATE_300, thickness: 1 });
      b.y = y + 64 + 12;
    } catch {
      // Si la firma no se puede leer/decodificar, se omite sin interrumpir el informe.
    }
  }

  // --- Resultado WABIM ---
  const result = insp.result;
  sectionTitle(b, "Grado de afectación total de la estructura (D.T.A.)");
  if (!result) {
    b.text("Esta inspección aún no tiene un cálculo WABIM guardado.", { size: 10, color: SLATE_500 });
  } else {
    b.text(fmtPct(result.dta), { size: 28, font: fonts.bold, color: bandColor(result.dta) });
    b.text(CONDITION_LABEL[result.condition] ?? result.condition, { size: 11, color: INK });
    b.text(result.recommendation ?? "", { size: 9, color: SLATE_600 });
    b.y += 4;
    barRow(b, "Total estructura", result.dta);
  }

  // --- Grado de afectación por elemento y por categoría ---
  if (result && insp.subCategoryResults?.length) {
    sectionTitle(b, "Grado de afectación por elemento");
    const elementsBySubcategory = new Map();
    for (const el of insp.elements) {
      const code = el.elementDef.subcategory_code;
      if (!elementsBySubcategory.has(code)) elementsBySubcategory.set(code, []);
      elementsBySubcategory.get(code).push(el);
    }
    for (const sc of insp.subCategoryResults) {
      b.ensureSpace(30);
      b.page.drawText(`${subCategoryName.get(sc.subcategory_code) ?? sc.subcategory_code}`, { x: PAGE_MARGIN, y: PAGE_HEIGHT - b.y - 11, size: 11, font: fonts.bold, color: SLATE_800 });
      const nameWidth = fonts.bold.widthOfTextAtSize(`${subCategoryName.get(sc.subcategory_code) ?? sc.subcategory_code}  `, 11);
      b.page.drawText(`(C.E.C.=${sc.cec_used})`, { x: PAGE_MARGIN + nameWidth, y: PAGE_HEIGHT - b.y - 11, size: 9, font: fonts.regular, color: SLATE_400 });
      b.y += 16;
      const els = (elementsBySubcategory.get(sc.subcategory_code) ?? []).filter((e) => e.result?.has_data);
      if (!els.length) {
        b.text("Sin elementos inspeccionados en esta subcategoría.", { size: 9, color: SLATE_400 });
      } else {
        for (const el of els) barRow(b, el.elementDef.name, el.result.dae, { indent: 10 });
      }
      b.y += 6;
    }

    sectionTitle(b, "Grado de afectación por categoría");
    for (const sc of insp.subCategoryResults) {
      barRow(b, subCategoryName.get(sc.subcategory_code) ?? sc.subcategory_code, sc.dasc);
    }
  }

  // --- Detalle de patologías registradas (con sus fotos junto a cada una) ---
  const elementsWithData = insp.elements.filter((el) => el.subElements.some((se) => se.pathologies.length));
  if (elementsWithData.length) {
    sectionTitle(b, "Detalle de patologías registradas");
    for (const el of elementsWithData) {
      b.ensureSpace(20);
      b.text(`${el.elementDef.name}${el.label ? " — " + el.label : ""}`, { size: 10, font: fonts.bold, color: SLATE_800 });
      await photoThumbRow(b, el.photos, 0);
      for (const se of el.subElements) {
        if (!se.pathologies.length) continue;
        b.ensureSpace(16);
        b.text(`${se.subElementDef.name}${se.label ? " — " + se.label : ""} (I.C.=${se.ic_used})`, { x: PAGE_MARGIN + 10, width: CONTENT_WIDTH - 10, size: 9, color: SLATE_600 });
        for (const pa of se.pathologies) {
          b.ensureSpace(14);
          const severity = pa.dc_used === 3 ? "Alto" : pa.dc_used === 2 ? "Medio" : pa.dc_used === 1 ? "Bajo" : "—";
          const line = `${pa.pathologyDef.name} (${pa.pathology_code}): ${pa.measured_value}/${pa.total_measure} ${pa.pathologyDef.unit} -> densidad ${fmtPct(pa.density_pct)}, D.C.=${severity}, W.A.P.=${pa.wap != null ? pa.wap.toFixed(2) : "—"}`;
          b.text(line, { x: PAGE_MARGIN + 20, width: CONTENT_WIDTH - 20, size: 8.5, color: SLATE_700 });
          await photoThumbRow(b, pa.photos, 20);
        }
      }
      b.y += 6;
    }
  }

  // --- Pie de página con numeración ---
  b.pages.forEach((page, i) => {
    page.drawText(
      `Página ${i + 1} de ${b.pages.length} · Generado el ${new Date().toLocaleDateString("es-CO")} · WABIM: Amariles-López & Osorio-Gómez (2023), Revista DYNA 90(225) · Manual INVÍAS (2006)`,
      { x: PAGE_MARGIN, y: 20, size: 7.5, font: fonts.regular, color: SLATE_400 },
    );
  });

  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: "application/pdf" });
}

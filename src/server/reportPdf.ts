/**
 * Generación del informe PDF de una inspección — datos generales del puente,
 * resultados WABIM (mismo formato que la hoja "Grado de afectación" del
 * Excel de referencia) y las fotos de cada daño junto a su propia patología
 * en el detalle (no agrupadas en una galería aparte al final del informe).
 *
 * Usa `pdfkit` (dibujo de página, sin dependencia de un motor de navegador).
 * Los 3 logos institucionales se incrustan como PNG (el de Unilibre se
 * rasterizó una vez a partir del SVG original — ver
 * public/assets/logos/unilibre-pereira.png — porque incrustar SVG vía
 * `svg-to-pdfkit` se renderizaba de forma inconsistente/superpuesta según
 * el visor de PDF).
 */
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getInspection, getBridge, getCatalog } from "../db/queries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "..", "public");
const LOGOS_DIR = join(PUBLIC_DIR, "assets", "logos");

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 puntos
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

// Bandas de color por % (Tabla 4 WABIM) — mismos rangos que wabimBarColor en public/app.js.
const BANDS = [
  { max: 10, hex: "#22c55e" },
  { max: 40, hex: "#eab308" },
  { max: 50, hex: "#f97316" },
  { max: 90, hex: "#ef4444" },
  { max: 100, hex: "#b91c1c" },
];
function bandColor(pct: number): string {
  const c = Math.max(0, Math.min(100, Number(pct) || 0));
  return (BANDS.find((b) => c <= b.max) ?? BANDS[BANDS.length - 1]).hex;
}

function fmtPct(n: number | null | undefined): string {
  return n == null ? "—" : `${Number(n).toFixed(2)}%`;
}

const CONDITION_LABEL: Record<string, string> = {
  SIN_DETERIORO: "Sin deterioro",
  DETERIORO_BAJO: "Deterioro bajo",
  DETERIORO_MODERADO: "Deterioro moderado",
  DETERIORO_MEDIO_ALTO: "Deterioro medio-alto",
  DETERIORO_ALTO: "Deterioro alto — susceptible de colapso",
};

type Doc = PDFKit.PDFDocument;

function ensureSpace(doc: Doc, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

// pdfkit deja el "cursor" x donde terminó la última llamada a .text(x,y,...)
// con posición explícita (p.ej. la cifra de % alineada a la derecha en
// barRow, o la segunda columna de keyValueGrid). Si el siguiente texto no
// pasa su propia x, hereda esa posición angosta y el texto se ve "apilado"
// letra por letra. Por eso aquí SIEMPRE se fija x=PAGE_MARGIN explícitamente.
function sectionTitle(doc: Doc, text: string) {
  ensureSpace(doc, 30);
  doc.x = PAGE_MARGIN;
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor("#1e293b").font("Helvetica-Bold").text(text, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveTo(PAGE_MARGIN, doc.y + 2).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y + 2).strokeColor("#e2e8f0").stroke();
  doc.moveDown(0.5);
  doc.x = PAGE_MARGIN;
  doc.font("Helvetica").fillColor("#0f172a");
}

function keyValueGrid(doc: Doc, pairs: Array<[string, string]>) {
  const colWidth = CONTENT_WIDTH / 2;
  let col = 0;
  let rowY = doc.y;
  for (const [label, value] of pairs) {
    ensureSpace(doc, 26);
    const x = PAGE_MARGIN + col * colWidth;
    if (col === 0) rowY = doc.y;
    doc.fontSize(8).fillColor("#94a3b8").text(label.toUpperCase(), x, rowY, { width: colWidth - 10 });
    doc.fontSize(10).fillColor("#0f172a").text(value || "—", x, doc.y, { width: colWidth - 10 });
    if (col === 0) {
      col = 1;
    } else {
      col = 0;
      doc.y = Math.max(doc.y, rowY);
      doc.moveDown(0.6);
    }
  }
  if (col === 1) doc.moveDown(0.6);
  doc.x = PAGE_MARGIN;
}

/** Barra horizontal de % con su etiqueta, imitando el estilo de la sección "Grado de afectación" de la app web. */
function barRow(doc: Doc, label: string, pct: number, opts: { indent?: number; sub?: string } = {}) {
  ensureSpace(doc, 20);
  const indent = opts.indent ?? 0;
  const labelWidth = 190 - indent;
  const barX = PAGE_MARGIN + indent + labelWidth + 6;
  const barWidth = CONTENT_WIDTH - indent - labelWidth - 60;
  const y = doc.y + 2;

  doc.fontSize(9).fillColor("#334155").text(label + (opts.sub ? `  ${opts.sub}` : ""), PAGE_MARGIN + indent, y, { width: labelWidth });

  const barY = y + 1;
  doc.roundedRect(barX, barY, barWidth, 8, 3).fill("#e2e8f0");
  const w = Math.max(3, (Math.max(0, Math.min(100, pct)) / 100) * barWidth);
  doc.roundedRect(barX, barY, w, 8, 3).fill(bandColor(pct));

  doc.fontSize(9).fillColor("#0f172a").text(fmtPct(pct), barX + barWidth + 8, y, { width: 55, align: "right" });
  doc.y = Math.max(doc.y, y + 14);
  doc.x = PAGE_MARGIN;
}

/**
 * Coloca los 3 logos en fila, calculando el ancho real de cada uno a partir
 * de su proporción propia (vía doc.openImage) en vez de un avance de x fijo:
 * un incremento fijo asumía un ancho parecido para los tres logos, pero al
 * tener proporciones muy distintas (apaisado, cuadrado, apaisado ancho) el
 * siguiente logo terminaba dibujándose encima del anterior.
 */
function addLogosHeader(doc: Doc) {
  const y = PAGE_MARGIN - 10;
  const targetHeight = 26;
  const gap = 14;
  let x = PAGE_MARGIN;
  const logoPaths = [
    join(LOGOS_DIR, "invias.png"),
    join(LOGOS_DIR, "utp.png"),
    join(LOGOS_DIR, "unilibre-pereira.png"),
  ];
  for (const logoPath of logoPaths) {
    if (!existsSync(logoPath)) continue;
    try {
      const img = (doc as any).openImage(logoPath);
      const width = (img.width / img.height) * targetHeight;
      doc.image(logoPath, x, y, { height: targetHeight });
      x += width + gap;
    } catch {
      // Un logo puntual que no se pueda leer/decodificar no debe romper el informe.
    }
  }
  doc.fillColor("#0f172a");
}

/**
 * Fila de miniaturas de fotos, dibujada en el punto actual del documento
 * (con ajuste de línea si hay más fotos de las que caben). Se usa para
 * mostrar las fotos de cada elemento/patología junto a su propio detalle,
 * en vez de agruparlas todas en una galería al final del informe.
 */
function photoThumbRow(doc: Doc, photos: any[] | undefined, indent: number) {
  if (!photos || !photos.length) return;
  const thumbSize = 60;
  const gap = 8;
  const startX = PAGE_MARGIN + indent;
  const availWidth = CONTENT_WIDTH - indent;
  const perRow = Math.max(1, Math.floor((availWidth + gap) / (thumbSize + gap)));

  ensureSpace(doc, thumbSize + 10);
  let rowTop = doc.y + 2;
  let col = 0;
  for (const p of photos) {
    if (col >= perRow) {
      doc.y = rowTop + thumbSize + 6;
      ensureSpace(doc, thumbSize + 10);
      rowTop = doc.y;
      col = 0;
    }
    const x = startX + col * (thumbSize + gap);
    const filePath = join(PUBLIC_DIR, p.url);
    try {
      if (existsSync(filePath)) doc.image(filePath, x, rowTop, { fit: [thumbSize, thumbSize] });
    } catch {
      // Si una foto puntual no se puede leer/decodificar, se omite sin interrumpir el informe.
    }
    col++;
  }
  doc.y = rowTop + thumbSize + 10;
  doc.x = PAGE_MARGIN;
}

/**
 * Foto panorámica de la estructura (si la inspección tiene alguna) como
 * banner de portada, con el nombre/código del puente superpuesto sobre una
 * franja semitransparente — para un informe con identidad visual propia de
 * cada puente en vez de una plantilla genérica de solo texto.
 */
function addPanoramicBanner(doc: Doc, photoUrl: string, bridge: any): boolean {
  const filePath = join(PUBLIC_DIR, photoUrl);
  if (!existsSync(filePath)) return false;
  try {
    const bannerHeight = 170;
    ensureSpace(doc, bannerHeight + 20);
    doc.x = PAGE_MARGIN;
    const y = doc.y;
    // `cover` escala la imagen para llenar el recuadro pero NO la recorta —
    // sin un clip explícito, el sobrante se dibuja fuera del recuadro y puede
    // superponerse con el contenido de arriba/abajo (se detectó visualmente
    // como el título superpuesto con el banner).
    doc.save();
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, bannerHeight).clip();
    doc.image(filePath, PAGE_MARGIN, y, { width: CONTENT_WIDTH, height: bannerHeight, cover: [CONTENT_WIDTH, bannerHeight], align: "center", valign: "center" });
    doc.restore();
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, bannerHeight).lineWidth(1).strokeColor("#cbd5e1").stroke();

    const barHeight = 34;
    doc.save();
    doc.fillOpacity(0.72);
    doc.rect(PAGE_MARGIN, y + bannerHeight - barHeight, CONTENT_WIDTH, barHeight).fill("#0f172a");
    doc.restore();
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12).text(
      bridge?.name ?? "—",
      PAGE_MARGIN + 10,
      y + bannerHeight - barHeight + 6,
      { width: CONTENT_WIDTH - 20 },
    );
    doc.font("Helvetica").fontSize(8.5).fillColor("#e2e8f0").text(
      `${bridge?.code ?? "—"} · ${bridge?.municipality ?? "—"}, ${bridge?.department ?? "—"}`,
      PAGE_MARGIN + 10,
      y + bannerHeight - barHeight + 20,
      { width: CONTENT_WIDTH - 20 },
    );

    doc.y = y + bannerHeight + 12;
    doc.x = PAGE_MARGIN;
    doc.fillColor("#0f172a");
    return true;
  } catch {
    // Si la foto no se puede leer/decodificar, se omite el banner sin romper el informe.
    return false;
  }
}

export function buildInspectionReportPdf(inspectionId: string): Doc {
  const insp = getInspection(inspectionId) as any;
  if (!insp) throw new Error(`Inspección no encontrada: ${inspectionId}`);
  const bridge = getBridge(insp.bridge_id) as any;
  const catalog = getCatalog();
  const subCategoryName = new Map(catalog.subCategories.map((s) => [s.code, s.name]));

  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });

  // --- Encabezado ---
  addLogosHeader(doc);
  doc.moveDown(2.2);
  doc.fontSize(18).font("Helvetica-Bold").fillColor("#1e293b").text("Informe de Inspección Visual de Puente", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.fontSize(10).font("Helvetica").fillColor("#64748b").text("Metodología WABIM (Amariles-López & Osorio-Gómez, 2023) + Manual para la Inspección Visual de Puentes y Pontones, INVÍAS (2006)", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(1);

  const panoramicPhotos = (insp.panoramicPhotos as any[] | undefined) ?? [];
  if (panoramicPhotos[0]) addPanoramicBanner(doc, panoramicPhotos[0].url, bridge);
  // Las fotos panorámicas no están ligadas a un elemento/patología específico
  // (por eso no encajan en el detalle por patología); la primera ya se usa
  // como portada, y el resto se muestra aquí mismo en vez de al final.
  if (panoramicPhotos.length > 1) {
    doc.fontSize(8).fillColor("#94a3b8").text("Otras vistas panorámicas", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    photoThumbRow(doc, panoramicPhotos.slice(1), 0);
    doc.moveDown(0.3);
  }

  // --- Datos generales del puente ---
  sectionTitle(doc, "Datos generales del puente");
  keyValueGrid(doc, [
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
  sectionTitle(doc, "Datos de la inspección");
  keyValueGrid(doc, [
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
    doc.x = PAGE_MARGIN;
    doc.fontSize(8).fillColor("#94a3b8").text("NOTAS", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.fontSize(10).fillColor("#0f172a").text(insp.notes, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
    doc.x = PAGE_MARGIN;
  }

  // --- Resultado WABIM ---
  const result = insp.result;
  sectionTitle(doc, "Grado de afectación total de la estructura (D.T.A.)");
  if (!result) {
    doc.fontSize(10).fillColor("#64748b").text("Esta inspección aún no tiene un cálculo WABIM guardado.", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  } else {
    doc.fontSize(28).font("Helvetica-Bold").fillColor(bandColor(result.dta)).text(fmtPct(result.dta), PAGE_MARGIN, doc.y);
    doc.font("Helvetica").fontSize(11).fillColor("#0f172a").text(CONDITION_LABEL[result.condition] ?? result.condition, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.fontSize(9).fillColor("#475569").text(result.recommendation ?? "", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.3);
    barRow(doc, "Total estructura", result.dta);
  }

  // --- Grado de afectación por elemento y por categoría ---
  if (result && insp.subCategoryResults?.length) {
    sectionTitle(doc, "Grado de afectación por elemento");
    const elementsBySubcategory = new Map<string, any[]>();
    for (const el of insp.elements) {
      const code = el.elementDef.subcategory_code;
      if (!elementsBySubcategory.has(code)) elementsBySubcategory.set(code, []);
      elementsBySubcategory.get(code)!.push(el);
    }
    for (const sc of insp.subCategoryResults) {
      ensureSpace(doc, 30);
      doc.x = PAGE_MARGIN;
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#1e293b").text(`${subCategoryName.get(sc.subcategory_code) ?? sc.subcategory_code}  `, PAGE_MARGIN, doc.y, { continued: true });
      doc.font("Helvetica").fontSize(9).fillColor("#94a3b8").text(`(C.E.C.=${sc.cec_used})`);
      doc.x = PAGE_MARGIN;
      doc.moveDown(0.2);
      const els = (elementsBySubcategory.get(sc.subcategory_code) ?? []).filter((e) => e.result?.has_data);
      if (!els.length) {
        doc.fontSize(9).fillColor("#94a3b8").text("Sin elementos inspeccionados en esta subcategoría.", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      } else {
        for (const el of els) {
          barRow(doc, el.elementDef.name, el.result.dae, { indent: 10 });
        }
      }
      doc.moveDown(0.4);
    }

    sectionTitle(doc, "Grado de afectación por categoría");
    for (const sc of insp.subCategoryResults) {
      barRow(doc, subCategoryName.get(sc.subcategory_code) ?? sc.subcategory_code, sc.dasc);
    }
  }

  // --- Detalle de patologías registradas (con sus fotos junto a cada una) ---
  const elementsWithData = (insp.elements as any[]).filter((el) => el.subElements.some((se: any) => se.pathologies.length));
  if (elementsWithData.length) {
    sectionTitle(doc, "Detalle de patologías registradas");
    for (const el of elementsWithData) {
      ensureSpace(doc, 20);
      doc.x = PAGE_MARGIN;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#1e293b").text(`${el.elementDef.name}${el.label ? " — " + el.label : ""}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.font("Helvetica");
      photoThumbRow(doc, el.photos, 0);
      for (const se of el.subElements) {
        if (!se.pathologies.length) continue;
        ensureSpace(doc, 16);
        doc.fontSize(9).fillColor("#475569").text(`${se.subElementDef.name}${se.label ? " — " + se.label : ""} (I.C.=${se.ic_used})`, PAGE_MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 10 });
        for (const pa of se.pathologies) {
          ensureSpace(doc, 14);
          const severity = pa.dc_used === 3 ? "Alto" : pa.dc_used === 2 ? "Medio" : pa.dc_used === 1 ? "Bajo" : "—";
          const line = `${pa.pathologyDef.name} (${pa.pathology_code}): ${pa.measured_value}/${pa.total_measure} ${pa.pathologyDef.unit} -> densidad ${fmtPct(pa.density_pct)}, D.C.=${severity}, W.A.P.=${pa.wap != null ? pa.wap.toFixed(2) : "—"}`;
          doc.fontSize(8.5).fillColor("#334155").text(line, PAGE_MARGIN + 20, doc.y, { width: CONTENT_WIDTH - 20 });
          photoThumbRow(doc, pa.photos, 20);
        }
      }
      doc.x = PAGE_MARGIN;
      doc.moveDown(0.4);
    }
  }

  // --- Pie de página con numeración ---
  // El texto se dibuja a 30pt del borde, dentro de la zona de margen inferior
  // (50pt): sin desactivar el margen ahí, pdfkit interpreta que "no cabe" y
  // agrega automáticamente una página en blanco extra para el footer.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(7.5).fillColor("#94a3b8").text(
      `Página ${i + 1} de ${range.count} · Generado el ${new Date().toLocaleDateString("es-CO")} · WABIM: Amariles-López & Osorio-Gómez (2023), Revista DYNA 90(225) · Manual INVÍAS (2006)`,
      PAGE_MARGIN,
      doc.page.height - 30,
      { width: CONTENT_WIDTH, align: "center" },
    );
    doc.page.margins.bottom = originalBottomMargin;
  }

  doc.end();
  return doc;
}

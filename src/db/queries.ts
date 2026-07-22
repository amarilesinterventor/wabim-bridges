/**
 * Funciones de acceso a datos (SQLite) usadas por el servidor de demostración.
 * Ver la nota en db.ts: en producción este archivo se reemplaza por llamadas
 * a `PrismaClient` sobre prisma/schema.prisma; el resto de la aplicación
 * (motor WABIM, rutas HTTP, frontend) no necesita cambios.
 */
import { db, newId } from "./db.js";
import type { WabimCatalog } from "../wabim/types.js";

// --- Catálogo ---------------------------------------------------------------

export function getCatalog(): WabimCatalog {
  const subCategories = db.prepare(`SELECT * FROM wabim_subcategories`).all() as any[];
  const elements = db.prepare(`SELECT * FROM wabim_elements`).all() as any[];
  const subElements = db.prepare(`SELECT * FROM wabim_subelements`).all() as any[];
  const pathologyTypes = db.prepare(`SELECT * FROM wabim_pathology_types`).all() as any[];

  return {
    subCategories: subCategories.map((s) => ({ code: s.code, name: s.name, cec: s.cec, source: s.source })),
    elements: elements.map((e) => ({
      code: e.code,
      name: e.name,
      subCategory: e.subcategory_code,
      ec: e.ec,
      source: e.source,
      invias: e.invias_ref,
    })),
    subElements: subElements.map((se) => ({
      code: se.code,
      name: se.name,
      elementCode: se.element_code,
      ic: se.ic,
      unit: se.unit,
      source: se.source,
      invias: se.invias_ref,
    })),
    pathologyTypes: pathologyTypes.map((p) => ({
      code: p.code,
      name: p.name,
      subElementCode: p.subelement_code,
      unit: p.unit,
      thresholds: { lowMax: p.low_max, highMin: p.high_min },
      source: p.source,
      note: p.note,
    })),
  };
}

export function updateSubCategoryCec(code: string, cec: number) {
  db.prepare(`UPDATE wabim_subcategories SET cec = ? WHERE code = ?`).run(cec, code);
}
export function updateElementEc(code: string, ec: number) {
  db.prepare(`UPDATE wabim_elements SET ec = ? WHERE code = ?`).run(ec, code);
}
export function updateSubElementIc(code: string, ic: number) {
  db.prepare(`UPDATE wabim_subelements SET ic = ? WHERE code = ?`).run(ic, code);
}
export function updatePathologyThresholds(code: string, lowMax: number, highMin: number) {
  db.prepare(`UPDATE wabim_pathology_types SET low_max = ?, high_min = ? WHERE code = ?`).run(lowMax, highMin, code);
}

// --- Puentes ------------------------------------------------------------------

export function listBridges() {
  return db.prepare(`SELECT * FROM bridges ORDER BY created_at DESC`).all();
}

export function getBridge(id: string) {
  const bridge = db.prepare(`SELECT * FROM bridges WHERE id = ?`).get(id);
  if (!bridge) return null;
  const documents = db.prepare(`SELECT * FROM bridge_documents WHERE bridge_id = ?`).all(id);
  const inspections = db
    .prepare(`SELECT i.*, r.dta, r.condition FROM inspections i LEFT JOIN inspection_results r ON r.inspection_id = i.id WHERE i.bridge_id = ? ORDER BY i.created_at DESC`)
    .all(id);
  return { ...(bridge as any), documents, inspections };
}

/** URLs de todas las fotos (panorámicas + de daño) de las inspecciones de un puente, para borrar los archivos del disco antes de eliminar el registro. */
export function getBridgePhotoUrls(bridgeId: string): string[] {
  const rows = db
    .prepare(
      `SELECT p.url FROM photos p
       WHERE p.inspection_id IN (SELECT id FROM inspections WHERE bridge_id = ?)
          OR p.inspection_element_id IN (
               SELECT ie.id FROM inspection_elements ie
               WHERE ie.inspection_id IN (SELECT id FROM inspections WHERE bridge_id = ?)
             )
          OR p.pathology_record_id IN (
               SELECT pr.id FROM pathology_records pr
               JOIN inspection_subelements ise ON ise.id = pr.inspection_subelement_id
               JOIN inspection_elements ie ON ie.id = ise.inspection_element_id
               WHERE ie.inspection_id IN (SELECT id FROM inspections WHERE bridge_id = ?)
             )`,
    )
    .all(bridgeId, bridgeId, bridgeId) as any[];
  return rows.map((r) => r.url);
}

/** Elimina el puente y, por cascada (ON DELETE CASCADE), sus inspecciones, elementos, patologías y fotos en base de datos. Los archivos de foto en disco deben borrarse aparte (ver getBridgePhotoUrls). */
export function deleteBridge(id: string) {
  db.prepare(`DELETE FROM bridges WHERE id = ?`).run(id);
}

export function createBridge(payload: Record<string, any>) {
  const id = newId();
  db.prepare(`
    INSERT INTO bridges (
      id, code, name, municipality, department, latitude, longitude, route, route_code, concession, km, skew,
      structural_type_transverse, structural_type_longitudinal, number_of_spans,
      length, width, gauge, material, construction_year, owner, entity, notes, main_photo_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.code,
    payload.name,
    payload.municipality ?? null,
    payload.department ?? null,
    payload.latitude ?? null,
    payload.longitude ?? null,
    payload.route ?? null,
    payload.routeCode ?? null,
    payload.concession == null || payload.concession === "" ? null : payload.concession === true || payload.concession === "true" || payload.concession === "1" ? 1 : 0,
    payload.km ?? null,
    payload.skew ?? null,
    payload.structuralTypeTransverse ?? null,
    payload.structuralTypeLongitudinal ?? null,
    payload.numberOfSpans ?? null,
    payload.length ?? null,
    payload.width ?? null,
    payload.gauge ?? null,
    payload.material ?? null,
    payload.constructionYear ?? null,
    payload.owner ?? null,
    payload.entity ?? null,
    payload.notes ?? null,
    payload.mainPhotoUrl ?? null,
  );
  return getBridge(id);
}

// --- Inspecciones ---------------------------------------------------------------

export function createInspection(bridgeId: string, payload: Record<string, any>) {
  const id = newId();
  db.prepare(`
    INSERT INTO inspections (id, bridge_id, scheduled_date, executed_date, time, weather, equipment, status, priority, notes, inspector_id, coordinator_id, responsible_name, responsible_id_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    bridgeId,
    payload.scheduledDate ?? null,
    payload.executedDate ?? null,
    payload.time ?? null,
    payload.weather ?? null,
    payload.equipment ?? null,
    payload.status ?? "SCHEDULED",
    payload.priority ?? "MEDIUM",
    payload.notes ?? null,
    payload.inspectorId ?? null,
    payload.coordinatorId ?? null,
    payload.responsibleName ?? null,
    payload.responsibleIdNumber ?? null,
  );
  return getInspection(id);
}

/** Nombre y cédula de quien levantó/firmó el informe en campo (Anexo A INVÍAS, campo "LEVANTÓ"). */
export function updateInspectionResponsible(id: string, payload: { responsibleName?: string; responsibleIdNumber?: string }) {
  db.prepare(`UPDATE inspections SET responsible_name = ?, responsible_id_number = ? WHERE id = ?`).run(
    payload.responsibleName ?? null,
    payload.responsibleIdNumber ?? null,
    id,
  );
  return getInspection(id);
}

export function getInspection(id: string) {
  const inspection = db.prepare(`SELECT * FROM inspections WHERE id = ?`).get(id) as any;
  if (!inspection) return null;
  const bridge = db.prepare(`SELECT id, code, name FROM bridges WHERE id = ?`).get(inspection.bridge_id);

  const elements = db.prepare(`SELECT * FROM inspection_elements WHERE inspection_id = ?`).all(id) as any[];
  for (const el of elements) {
    el.elementDef = db.prepare(`SELECT * FROM wabim_elements WHERE code = ?`).get(el.element_code);
    el.photos = db.prepare(`SELECT * FROM photos WHERE inspection_element_id = ? AND pathology_record_id IS NULL`).all(el.id) as any[];
    el.subElements = db.prepare(`SELECT * FROM inspection_subelements WHERE inspection_element_id = ?`).all(el.id) as any[];
    for (const se of el.subElements) {
      se.subElementDef = db.prepare(`SELECT * FROM wabim_subelements WHERE code = ?`).get(se.subelement_code);
      se.pathologies = db.prepare(`SELECT * FROM pathology_records WHERE inspection_subelement_id = ?`).all(se.id) as any[];
      for (const pa of se.pathologies) {
        pa.pathologyDef = db.prepare(`SELECT * FROM wabim_pathology_types WHERE code = ?`).get(pa.pathology_code);
        pa.photos = db.prepare(`SELECT * FROM photos WHERE pathology_record_id = ?`).all(pa.id) as any[];
      }
    }
    el.result = db.prepare(`SELECT * FROM element_results WHERE inspection_element_id = ?`).get(el.id) ?? null;
  }

  const subCategoryResults = db.prepare(`SELECT * FROM subcategory_results WHERE inspection_id = ?`).all(id);
  const result = db.prepare(`SELECT * FROM inspection_results WHERE inspection_id = ?`).get(id) ?? null;
  const panoramicPhotos = db.prepare(`SELECT * FROM photos WHERE inspection_id = ? AND kind = 'PANORAMIC'`).all(id) as any[];

  return { ...inspection, bridge, elements, subCategoryResults, result, panoramicPhotos };
}

export function addInspectionElement(inspectionId: string, elementCode: string, label?: string) {
  const id = newId();
  db.prepare(`INSERT INTO inspection_elements (id, inspection_id, element_code, label) VALUES (?, ?, ?, ?)`).run(
    id,
    inspectionId,
    elementCode,
    label ?? null,
  );
  return id;
}

export function addInspectionSubElement(
  inspectionElementId: string,
  subElementCode: string,
  icUsed: number,
  label?: string,
) {
  const id = newId();
  db.prepare(
    `INSERT INTO inspection_subelements (id, inspection_element_id, subelement_code, ic_used, label) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, inspectionElementId, subElementCode, icUsed, label ?? null);
  return id;
}

export function addPathologyRecord(
  inspectionSubElementId: string,
  pathologyCode: string,
  measuredValue: number,
  totalMeasure: number,
  extra: Record<string, any> = {},
) {
  const id = newId();
  db.prepare(`
    INSERT INTO pathology_records (id, inspection_subelement_id, pathology_code, measured_value, total_measure, description, location, extent, quantity, length, area, depth, width, affectation_level, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    inspectionSubElementId,
    pathologyCode,
    measuredValue,
    totalMeasure,
    extra.description ?? null,
    extra.location ?? null,
    extra.extent ?? null,
    extra.quantity ?? null,
    extra.length ?? null,
    extra.area ?? null,
    extra.depth ?? null,
    extra.width ?? null,
    extra.affectationLevel ?? null,
    extra.notes ?? null,
  );
  return id;
}

export function deletePathologyRecord(id: string) {
  db.prepare(`DELETE FROM pathology_records WHERE id = ?`).run(id);
}

// --- Fotos ------------------------------------------------------------------

export function addPhoto(payload: {
  url: string;
  caption?: string;
  inspectionElementId?: string | null;
  pathologyRecordId?: string | null;
  inspectionId?: string | null;
  kind?: string;
}) {
  const id = newId();
  db.prepare(
    `INSERT INTO photos (id, url, caption, inspection_id, inspection_element_id, pathology_record_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    payload.url,
    payload.caption ?? null,
    payload.inspectionId ?? null,
    payload.inspectionElementId ?? null,
    payload.pathologyRecordId ?? null,
    payload.kind ?? "DAMAGE",
  );
  return db.prepare(`SELECT * FROM photos WHERE id = ?`).get(id);
}

export function getPhoto(id: string) {
  return db.prepare(`SELECT * FROM photos WHERE id = ?`).get(id) as any;
}

export function deletePhoto(id: string) {
  db.prepare(`DELETE FROM photos WHERE id = ?`).run(id);
}
export function deleteInspectionSubElement(id: string) {
  db.prepare(`DELETE FROM inspection_subelements WHERE id = ?`).run(id);
}
export function deleteInspectionElement(id: string) {
  db.prepare(`DELETE FROM inspection_elements WHERE id = ?`).run(id);
}

export function clearCalculationResults(inspectionId: string) {
  const elementIds = (
    db.prepare(`SELECT id FROM inspection_elements WHERE inspection_id = ?`).all(inspectionId) as any[]
  ).map((r) => r.id);
  for (const elId of elementIds) {
    db.prepare(`DELETE FROM element_results WHERE inspection_element_id = ?`).run(elId);
  }
  db.prepare(`DELETE FROM subcategory_results WHERE inspection_id = ?`).run(inspectionId);
  db.prepare(`DELETE FROM inspection_results WHERE inspection_id = ?`).run(inspectionId);
}

// --- Usuarios ---------------------------------------------------------------

export function findUserByEmail(email: string) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;
}

export function listUsers() {
  return db.prepare(`SELECT id, name, email, role, active FROM users ORDER BY name`).all();
}

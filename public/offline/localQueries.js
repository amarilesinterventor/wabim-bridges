// Puerto a JS plano (navegador) de src/db/queries.ts — mismo SQL, mismo
// esquema (public/db-schema.sql es una copia de src/db/schema.sql), pero
// usando el shim sql.js (public/offline/sqlShim.js) en vez de node:sqlite.
// Mantener el mismo SQL palabra por palabra minimiza el riesgo de que la
// versión offline calcule/guarde distinto a la versión servidor.
import { prepare, newId } from "./sqlShim.js";

// --- Catálogo ---------------------------------------------------------------

export function getCatalog() {
  const subCategories = prepare(`SELECT * FROM wabim_subcategories`).all();
  const elements = prepare(`SELECT * FROM wabim_elements`).all();
  const subElements = prepare(`SELECT * FROM wabim_subelements`).all();
  const pathologyTypes = prepare(`SELECT * FROM wabim_pathology_types`).all();

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

export function updateSubCategoryCec(code, cec) {
  prepare(`UPDATE wabim_subcategories SET cec = ? WHERE code = ?`).run(cec, code);
}
export function updateElementEc(code, ec) {
  prepare(`UPDATE wabim_elements SET ec = ? WHERE code = ?`).run(ec, code);
}
export function updateSubElementIc(code, ic) {
  prepare(`UPDATE wabim_subelements SET ic = ? WHERE code = ?`).run(ic, code);
}
export function updatePathologyThresholds(code, lowMax, highMin) {
  prepare(`UPDATE wabim_pathology_types SET low_max = ?, high_min = ? WHERE code = ?`).run(lowMax, highMin, code);
}

// --- Puentes ------------------------------------------------------------------

export function listBridges() {
  return prepare(`SELECT * FROM bridges ORDER BY created_at DESC`).all();
}

export function getBridge(id) {
  const bridge = prepare(`SELECT * FROM bridges WHERE id = ?`).get(id);
  if (!bridge) return null;
  const documents = prepare(`SELECT * FROM bridge_documents WHERE bridge_id = ?`).all(id);
  const inspections = prepare(
    `SELECT i.*, r.dta, r.condition FROM inspections i LEFT JOIN inspection_results r ON r.inspection_id = i.id WHERE i.bridge_id = ? ORDER BY i.created_at DESC`,
  ).all(id);
  return { ...bridge, documents, inspections };
}

export function getBridgePhotoUrls(bridgeId) {
  const rows = prepare(
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
  ).all(bridgeId, bridgeId, bridgeId);
  const signatureRows = prepare(
    `SELECT signature_url AS url FROM inspections WHERE bridge_id = ? AND signature_url IS NOT NULL`,
  ).all(bridgeId);
  return [...rows, ...signatureRows].map((r) => r.url);
}

export function deleteBridge(id) {
  prepare(`DELETE FROM bridges WHERE id = ?`).run(id);
}

export function createBridge(payload) {
  const id = newId();
  prepare(`
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

export function createInspection(bridgeId, payload) {
  const id = newId();
  prepare(`
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

export function updateInspectionResponsible(id, payload) {
  prepare(`UPDATE inspections SET responsible_name = ?, responsible_id_number = ? WHERE id = ?`).run(
    payload.responsibleName ?? null,
    payload.responsibleIdNumber ?? null,
    id,
  );
  return getInspection(id);
}

export function updateInspectionSignature(id, signatureUrl) {
  prepare(`UPDATE inspections SET signature_url = ? WHERE id = ?`).run(signatureUrl, id);
  return getInspection(id);
}

export function getInspection(id) {
  const inspection = prepare(`SELECT * FROM inspections WHERE id = ?`).get(id);
  if (!inspection) return null;
  const bridge = prepare(`SELECT id, code, name FROM bridges WHERE id = ?`).get(inspection.bridge_id);

  const elements = prepare(`SELECT * FROM inspection_elements WHERE inspection_id = ?`).all(id);
  for (const el of elements) {
    el.elementDef = prepare(`SELECT * FROM wabim_elements WHERE code = ?`).get(el.element_code);
    el.photos = prepare(`SELECT * FROM photos WHERE inspection_element_id = ? AND pathology_record_id IS NULL`).all(el.id);
    el.subElements = prepare(`SELECT * FROM inspection_subelements WHERE inspection_element_id = ?`).all(el.id);
    for (const se of el.subElements) {
      se.subElementDef = prepare(`SELECT * FROM wabim_subelements WHERE code = ?`).get(se.subelement_code);
      se.pathologies = prepare(`SELECT * FROM pathology_records WHERE inspection_subelement_id = ?`).all(se.id);
      for (const pa of se.pathologies) {
        pa.pathologyDef = prepare(`SELECT * FROM wabim_pathology_types WHERE code = ?`).get(pa.pathology_code);
        pa.photos = prepare(`SELECT * FROM photos WHERE pathology_record_id = ?`).all(pa.id);
      }
    }
    el.result = prepare(`SELECT * FROM element_results WHERE inspection_element_id = ?`).get(el.id) ?? null;
  }

  const subCategoryResults = prepare(`SELECT * FROM subcategory_results WHERE inspection_id = ?`).all(id);
  const result = prepare(`SELECT * FROM inspection_results WHERE inspection_id = ?`).get(id) ?? null;
  const panoramicPhotos = prepare(`SELECT * FROM photos WHERE inspection_id = ? AND kind = 'PANORAMIC'`).all(id);

  return { ...inspection, bridge, elements, subCategoryResults, result, panoramicPhotos };
}

export function addInspectionElement(inspectionId, elementCode, label) {
  const id = newId();
  prepare(`INSERT INTO inspection_elements (id, inspection_id, element_code, label) VALUES (?, ?, ?, ?)`).run(
    id,
    inspectionId,
    elementCode,
    label ?? null,
  );
  return id;
}

export function addInspectionSubElement(inspectionElementId, subElementCode, icUsed, label) {
  const id = newId();
  prepare(
    `INSERT INTO inspection_subelements (id, inspection_element_id, subelement_code, ic_used, label) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, inspectionElementId, subElementCode, icUsed, label ?? null);
  return id;
}

export function addPathologyRecord(inspectionSubElementId, pathologyCode, measuredValue, totalMeasure, extra = {}) {
  const id = newId();
  prepare(`
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

export function deletePathologyRecord(id) {
  prepare(`DELETE FROM pathology_records WHERE id = ?`).run(id);
}

// --- Fotos ------------------------------------------------------------------

export function addPhoto(payload) {
  const id = newId();
  prepare(
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
  return prepare(`SELECT * FROM photos WHERE id = ?`).get(id);
}

export function getPhoto(id) {
  return prepare(`SELECT * FROM photos WHERE id = ?`).get(id);
}

export function deletePhoto(id) {
  prepare(`DELETE FROM photos WHERE id = ?`).run(id);
}
export function deleteInspectionSubElement(id) {
  prepare(`DELETE FROM inspection_subelements WHERE id = ?`).run(id);
}
export function deleteInspectionElement(id) {
  prepare(`DELETE FROM inspection_elements WHERE id = ?`).run(id);
}

export function clearCalculationResults(inspectionId) {
  const elementIds = prepare(`SELECT id FROM inspection_elements WHERE inspection_id = ?`).all(inspectionId).map((r) => r.id);
  for (const elId of elementIds) {
    prepare(`DELETE FROM element_results WHERE inspection_element_id = ?`).run(elId);
  }
  prepare(`DELETE FROM subcategory_results WHERE inspection_id = ?`).run(inspectionId);
  prepare(`DELETE FROM inspection_results WHERE inspection_id = ?`).run(inspectionId);
}

// --- Usuarios ---------------------------------------------------------------

export function findUserByEmail(email) {
  return prepare(`SELECT * FROM users WHERE email = ?`).get(email);
}

export function listUsers() {
  return prepare(`SELECT id, name, email, role, active FROM users ORDER BY name`).all();
}

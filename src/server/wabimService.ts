/**
 * Servicio que conecta la base de datos (SQLite, capa de demostración) con
 * el motor de cálculo WABIM puro (src/wabim/engine.ts).
 *
 * Construye las "lookups" (catálogo + coeficientes vigentes) leyendo la base
 * de datos en el momento del cálculo, para que cualquier edición hecha por
 * el administrador (I.C., E.C., C.E.C., umbrales D.C.) se refleje de
 * inmediato en los cálculos nuevos, sin afectar los ya guardados
 * (que quedan con sus coeficientes "congelados" en pathology_records,
 * element_results y subcategory_results).
 */
import { db, newId, transaction } from "../db/db.js";
import { getInspection, clearCalculationResults } from "../db/queries.js";
import { runWabimCalculation, type WabimLookups } from "../wabim/engine.js";
import type {
  WabimInspectionInput,
  ElementInstanceInput,
  SubElementInstanceInput,
  PathologyRecordInput,
  ElementDef,
  SubElementDef,
  PathologyTypeDef,
  SubCategoryDef,
  SubCategoryCode,
} from "../wabim/types.js";

function buildLookupsFromDb(): WabimLookups {
  const subCats = db.prepare(`SELECT * FROM wabim_subcategories`).all() as any[];
  const els = db.prepare(`SELECT * FROM wabim_elements`).all() as any[];
  const ses = db.prepare(`SELECT * FROM wabim_subelements`).all() as any[];
  const pas = db.prepare(`SELECT * FROM wabim_pathology_types`).all() as any[];

  const subCategoriesOrdered: SubCategoryDef[] = subCats.map((s) => ({
    code: s.code as SubCategoryCode,
    name: s.name,
    cec: s.cec,
    source: s.source,
  }));

  const elementDefs: ElementDef[] = els.map((e) => ({
    code: e.code,
    name: e.name,
    subCategory: e.subcategory_code,
    ec: e.ec,
    source: e.source,
    invias: e.invias_ref,
  }));

  const subElementDefs: SubElementDef[] = ses.map((se) => ({
    code: se.code,
    name: se.name,
    elementCode: se.element_code,
    ic: se.ic,
    unit: se.unit,
    source: se.source,
    invias: se.invias_ref,
  }));

  const pathologyDefs: PathologyTypeDef[] = pas.map((p) => ({
    code: p.code,
    name: p.name,
    subElementCode: p.subelement_code,
    unit: p.unit,
    thresholds: { lowMax: p.low_max, highMin: p.high_min },
    source: p.source,
    note: p.note,
  }));

  return {
    elementByCode: new Map(elementDefs.map((e) => [e.code, e])),
    subElementByCode: new Map(subElementDefs.map((s) => [s.code, s])),
    pathologyByCode: new Map(pathologyDefs.map((p) => [p.code, p])),
    subCategoryByCode: new Map(subCategoriesOrdered.map((s) => [s.code, s])),
    subCategoriesOrdered,
  };
}

/** Construye la estructura de entrada del motor a partir de lo guardado en BD para una inspección. */
function buildInspectionInput(inspectionId: string): WabimInspectionInput {
  const insp = getInspection(inspectionId);
  if (!insp) throw new Error(`Inspección no encontrada: ${inspectionId}`);

  const elements: ElementInstanceInput[] = (insp.elements as any[]).map((el) => {
    const subElements: SubElementInstanceInput[] = (el.subElements as any[]).map((se) => {
      const pathologies: PathologyRecordInput[] = (se.pathologies as any[]).map((pa) => ({
        id: pa.id,
        pathologyCode: pa.pathology_code,
        measuredValue: pa.measured_value,
        totalMeasure: pa.total_measure,
        description: pa.description ?? undefined,
        location: pa.location ?? undefined,
      }));
      return {
        id: se.id,
        subElementCode: se.subelement_code,
        label: se.label ?? undefined,
        pathologies,
      };
    });
    return {
      id: el.id,
      elementCode: el.element_code,
      label: el.label ?? undefined,
      subElements,
    };
  });

  return { inspectionId, elements };
}

/** Ejecuta el cálculo WABIM completo para una inspección y persiste (con trazabilidad) el resultado. */
export function calculateAndPersist(inspectionId: string) {
  const lookups = buildLookupsFromDb();
  const input = buildInspectionInput(inspectionId);
  const result = runWabimCalculation(input, lookups);

  return transaction(() => {
    clearCalculationResults(inspectionId);

    const insertPathologyUpdate = db.prepare(`
      UPDATE pathology_records SET density_pct=?, dc_used=?, ic_used=?, wap=?, low_max_used=?, high_min_used=?, calculated_at=?
      WHERE id = ?
    `);
    const insertElementResult = db.prepare(`
      INSERT INTO element_results (id, inspection_element_id, ec_used, dae, sum_wap, sum_dc_ic, has_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSubCategoryResult = db.prepare(`
      INSERT INTO subcategory_results (id, inspection_id, subcategory_code, cec_used, dasc, sum_dae_ec, sum_ec, has_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertInspectionResult = db.prepare(`
      INSERT INTO inspection_results (id, inspection_id, dta, sum_dasc_cec, sum_cec, condition, recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const sc of result.subCategories) {
      for (const el of sc.elements) {
        insertElementResult.run(newId(), el.elementInstanceId, el.ec, el.dae, el.sumWap, el.sumDcIc, el.hasData ? 1 : 0);
        for (const se of el.subElements) {
          for (const pa of se.pathologies) {
            insertPathologyUpdate.run(
              pa.densityPct,
              pa.dc,
              pa.ic,
              pa.wap,
              pa.thresholdsUsed.lowMax,
              pa.thresholdsUsed.highMin,
              result.calculatedAt,
              pa.pathologyRecordId,
            );
          }
        }
      }
      insertSubCategoryResult.run(
        newId(),
        inspectionId,
        sc.subCategory,
        sc.cec,
        sc.dasc,
        sc.sumDaeEc,
        sc.sumEc,
        sc.hasData ? 1 : 0,
      );
    }

    insertInspectionResult.run(
      newId(),
      inspectionId,
      result.dta,
      result.sumDascCec,
      result.sumCec,
      result.classification.condition,
      result.classification.recommendation,
    );

    return result;
  });
}

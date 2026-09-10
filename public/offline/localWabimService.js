// Puerto a JS plano de src/server/wabimService.ts. El motor de cálculo en sí
// (runWabimCalculation) NO se reescribe — se importa tal cual desde
// /wabim/engine.js (compilado del mismo src/wabim/engine.ts que usa el
// servidor), así que la matemática es idéntica en ambas versiones.
import { prepare, newId, transaction } from "./sqlShim.js";
import { getInspection, clearCalculationResults } from "./localQueries.js";
import { runWabimCalculation } from "/wabim/engine.js";

function buildLookupsFromDb() {
  const subCats = prepare(`SELECT * FROM wabim_subcategories`).all();
  const els = prepare(`SELECT * FROM wabim_elements`).all();
  const ses = prepare(`SELECT * FROM wabim_subelements`).all();
  const pas = prepare(`SELECT * FROM wabim_pathology_types`).all();

  const subCategoriesOrdered = subCats.map((s) => ({ code: s.code, name: s.name, cec: s.cec, source: s.source }));
  const elementDefs = els.map((e) => ({
    code: e.code,
    name: e.name,
    subCategory: e.subcategory_code,
    ec: e.ec,
    source: e.source,
    invias: e.invias_ref,
  }));
  const subElementDefs = ses.map((se) => ({
    code: se.code,
    name: se.name,
    elementCode: se.element_code,
    ic: se.ic,
    unit: se.unit,
    source: se.source,
    invias: se.invias_ref,
  }));
  const pathologyDefs = pas.map((p) => ({
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

function buildInspectionInput(inspectionId) {
  const insp = getInspection(inspectionId);
  if (!insp) throw new Error(`Inspección no encontrada: ${inspectionId}`);

  const elements = insp.elements.map((el) => {
    const subElements = el.subElements.map((se) => {
      const pathologies = se.pathologies.map((pa) => ({
        id: pa.id,
        pathologyCode: pa.pathology_code,
        measuredValue: pa.measured_value,
        totalMeasure: pa.total_measure,
        description: pa.description ?? undefined,
        location: pa.location ?? undefined,
      }));
      return { id: se.id, subElementCode: se.subelement_code, label: se.label ?? undefined, pathologies };
    });
    return { id: el.id, elementCode: el.element_code, label: el.label ?? undefined, subElements };
  });

  return { inspectionId, elements };
}

export function calculateAndPersist(inspectionId) {
  const lookups = buildLookupsFromDb();
  const input = buildInspectionInput(inspectionId);
  const result = runWabimCalculation(input, lookups);

  return transaction(() => {
    clearCalculationResults(inspectionId);

    const updatePathology = prepare(`
      UPDATE pathology_records SET density_pct=?, dc_used=?, ic_used=?, wap=?, low_max_used=?, high_min_used=?, calculated_at=?
      WHERE id = ?
    `);
    const insertElementResult = prepare(`
      INSERT INTO element_results (id, inspection_element_id, ec_used, dae, sum_wap, sum_dc_ic, has_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSubCategoryResult = prepare(`
      INSERT INTO subcategory_results (id, inspection_id, subcategory_code, cec_used, dasc, sum_dae_ec, sum_ec, has_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertInspectionResult = prepare(`
      INSERT INTO inspection_results (id, inspection_id, dta, sum_dasc_cec, sum_cec, condition, recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const sc of result.subCategories) {
      for (const el of sc.elements) {
        insertElementResult.run(newId(), el.elementInstanceId, el.ec, el.dae, el.sumWap, el.sumDcIc, el.hasData ? 1 : 0);
        for (const se of el.subElements) {
          for (const pa of se.pathologies) {
            updatePathology.run(
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
      insertSubCategoryResult.run(newId(), inspectionId, sc.subCategory, sc.cec, sc.dasc, sc.sumDaeEc, sc.sumEc, sc.hasData ? 1 : 0);
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

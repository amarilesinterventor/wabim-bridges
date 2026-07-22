/**
 * Motor de cálculo WABIM
 * ----------------------
 * Implementación íntegra de las Ecuaciones 1 a 5 de:
 *   Amariles-López, C.C. & Osorio-Gómez, C.C. (2023). "Weighted Average
 *   Bridge Inspection Methodology (WABIM)". Revista DYNA, 90(225), 55-63.
 *
 * Este módulo es puro (sin efectos secundarios, sin I/O, sin dependencias de
 * framework o base de datos) para que pueda usarse sin modificaciones tanto
 * en el servidor de demostración (Node puro, ver src/server) como en la
 * arquitectura objetivo (Next.js API routes o NestJS + Prisma/PostgreSQL).
 *
 * Cada función expone en su resultado los valores intermedios necesarios
 * para la trazabilidad y auditoría exigidas ("mostrar el desarrollo
 * matemático de los cálculos").
 */

import type {
  DensityThresholds,
  SeverityLevel,
  WabimInspectionInput,
  ElementInstanceInput,
  SubElementInstanceInput,
  PathologyRecordInput,
  PathologyResult,
  SubElementResult,
  ElementResult,
  SubCategoryResult,
  WabimResult,
  ConditionClassification,
  BridgeCondition,
  SubCategoryCode,
  ElementDef,
  SubElementDef,
  PathologyTypeDef,
  SubCategoryDef,
} from "./types.js";
import {
  elementByCode,
  subElementByCode,
  pathologyByCode,
  subCategoryByCode,
  SUB_CATEGORIES,
} from "./catalog.js";

/**
 * Tablas de consulta (catálogo + coeficientes) que usa el motor. Por defecto
 * se usan las constantes estáticas de catalog.ts (los valores publicados por
 * WABIM/INVÍAS), pero el servidor puede construir y pasar una versión leída
 * en vivo desde la base de datos para que los cambios que haga el
 * administrador sobre I.C./E.C./C.E.C./umbrales D.C. se reflejen de
 * inmediato en los CÁLCULOS NUEVOS (los cálculos ya guardados no se alteran,
 * pues sus coeficientes quedan "congelados" — ver PathologyResult, etc.).
 */
export interface WabimLookups {
  elementByCode: Map<string, ElementDef>;
  subElementByCode: Map<string, SubElementDef>;
  pathologyByCode: Map<string, PathologyTypeDef>;
  subCategoryByCode: Map<string, SubCategoryDef>;
  subCategoriesOrdered: SubCategoryDef[];
}

export const defaultLookups: WabimLookups = {
  elementByCode,
  subElementByCode,
  pathologyByCode,
  subCategoryByCode,
  subCategoriesOrdered: SUB_CATEGORIES,
};

// ---------------------------------------------------------------------------
// Ecuación 1 — Densidad de daño de la patología (%)
//   Damage Pathology Density = (Damage pathology measure / Total measure of subelement) * 100
// ---------------------------------------------------------------------------
export function calcDamageDensity(measuredValue: number, totalMeasure: number): number {
  if (!Number.isFinite(totalMeasure) || totalMeasure <= 0) {
    throw new Error(
      `La dimensión total de referencia de la patología debe ser un número positivo (recibido: ${totalMeasure}).`,
    );
  }
  if (!Number.isFinite(measuredValue) || measuredValue < 0) {
    throw new Error(`El valor medido del daño debe ser un número >= 0 (recibido: ${measuredValue}).`);
  }
  return (measuredValue / totalMeasure) * 100;
}

// ---------------------------------------------------------------------------
// Resolución del Coeficiente de Densidad (D.C.) a partir de los rangos de
// severidad (Tabla 6 [WABIM]). Semántica idéntica a la hoja de cálculo Excel
// de referencia ("Grado de afectación"): límites inclusivos hacia el rango
// inferior.
// ---------------------------------------------------------------------------
export function resolveDensityCoefficient(
  densityPct: number,
  thresholds: DensityThresholds,
): { severity: SeverityLevel; dc: number } {
  if (densityPct <= thresholds.lowMax) return { severity: "Bajo", dc: 1 };
  if (densityPct >= thresholds.highMin) return { severity: "Alto", dc: 3 };
  return { severity: "Medio", dc: 2 };
}

// ---------------------------------------------------------------------------
// Ecuación 2 — Promedio Ponderado de la Patología (W.A.P.)
//   WAP = Damage Pathology Density * D.C. * I.C.
// ---------------------------------------------------------------------------
export function calcWap(densityPct: number, dc: number, ic: number): number {
  return densityPct * dc * ic;
}

/** Calcula el resultado completo (con traza) de una patología individual. */
export function calculatePathology(
  record: PathologyRecordInput,
  subElementIc: number,
  lookups: WabimLookups = defaultLookups,
): PathologyResult {
  const pathologyDef = lookups.pathologyByCode.get(record.pathologyCode);
  if (!pathologyDef) {
    throw new Error(`Tipo de patología desconocido: '${record.pathologyCode}'.`);
  }
  const densityPct = calcDamageDensity(record.measuredValue, record.totalMeasure);
  const { severity, dc } = resolveDensityCoefficient(densityPct, pathologyDef.thresholds);
  const wap = calcWap(densityPct, dc, subElementIc);

  return {
    pathologyRecordId: record.id,
    pathologyCode: pathologyDef.code,
    pathologyName: pathologyDef.name,
    measuredValue: record.measuredValue,
    totalMeasure: record.totalMeasure,
    unit: pathologyDef.unit,
    densityPct,
    severity,
    dc,
    thresholdsUsed: pathologyDef.thresholds,
    ic: subElementIc,
    wap,
  };
}

/** Calcula el resultado de un sub-elemento (agrupa sus patologías). */
export function calculateSubElement(
  instance: SubElementInstanceInput,
  lookups: WabimLookups = defaultLookups,
): SubElementResult {
  const def = lookups.subElementByCode.get(instance.subElementCode);
  if (!def) throw new Error(`Sub-elemento desconocido: '${instance.subElementCode}'.`);

  const pathologies = instance.pathologies.map((p) => calculatePathology(p, def.ic, lookups));

  return {
    subElementInstanceId: instance.id,
    subElementCode: def.code,
    subElementName: def.name,
    ic: def.ic,
    pathologies,
  };
}

// ---------------------------------------------------------------------------
// Ecuación 3 — Grado de Afectación del Elemento (D.A.E. %)
//   DAE(%) = Σ WAP(complete element) / Σ (D.C._i * I.C._i)
//
// Solo se incluyen en las sumatorias las patologías efectivamente registradas
// (si un sub-elemento no reportó ninguna patología, no aporta al denominador),
// igual que en la hoja de cálculo Excel de referencia.
// ---------------------------------------------------------------------------
export function calculateElement(
  instance: ElementInstanceInput,
  lookups: WabimLookups = defaultLookups,
): ElementResult {
  const def = lookups.elementByCode.get(instance.elementCode);
  if (!def) throw new Error(`Elemento desconocido: '${instance.elementCode}'.`);

  const subElements = instance.subElements.map((se) => calculateSubElement(se, lookups));
  const allPathologies = subElements.flatMap((se) => se.pathologies);

  const sumWap = allPathologies.reduce((acc, p) => acc + p.wap, 0);
  const sumDcIc = allPathologies.reduce((acc, p) => acc + p.dc * p.ic, 0);
  const hasData = allPathologies.length > 0;
  const dae = hasData && sumDcIc > 0 ? sumWap / sumDcIc : 0;

  return {
    elementInstanceId: instance.id,
    elementCode: def.code,
    elementName: def.name,
    ec: def.ec,
    subCategory: def.subCategory,
    subElements,
    dae,
    sumWap,
    sumDcIc,
    hasData,
  };
}

// ---------------------------------------------------------------------------
// Ecuación 4 — Grado de Afectación de la Subcategoría (D.A.S.C. %)
//   DASC(%) = Σ (DAE_i * E.C._i) / Σ E.C._i
// ---------------------------------------------------------------------------
export function calculateSubCategory(
  subCategory: SubCategoryCode,
  elements: ElementResult[],
  lookups: WabimLookups = defaultLookups,
): SubCategoryResult {
  const def = lookups.subCategoryByCode.get(subCategory);
  if (!def) throw new Error(`Subcategoría desconocida: '${subCategory}'.`);

  const inspected = elements.filter((e) => e.hasData);
  const sumDaeEc = inspected.reduce((acc, e) => acc + e.dae * e.ec, 0);
  const sumEc = inspected.reduce((acc, e) => acc + e.ec, 0);
  const hasData = inspected.length > 0;
  const dasc = hasData && sumEc > 0 ? sumDaeEc / sumEc : 0;

  return {
    subCategory,
    subCategoryName: def.name,
    cec: def.cec,
    elements,
    dasc,
    sumDaeEc,
    sumEc,
    hasData,
  };
}

// ---------------------------------------------------------------------------
// Ecuación 5 — Grado de Afectación Total del puente (D.T.A. %)
//   DTA(%) = Σ (DASC_i * C.E.C._i) / Σ C.E.C._i
// ---------------------------------------------------------------------------
export function calculateTotalAffectation(subCategories: SubCategoryResult[]): {
  dta: number;
  sumDascCec: number;
  sumCec: number;
} {
  const inspected = subCategories.filter((s) => s.hasData);
  const sumDascCec = inspected.reduce((acc, s) => acc + s.dasc * s.cec, 0);
  const sumCec = inspected.reduce((acc, s) => acc + s.cec, 0);
  const dta = inspected.length > 0 && sumCec > 0 ? sumDascCec / sumCec : 0;
  return { dta, sumDascCec, sumCec };
}

// ---------------------------------------------------------------------------
// Tabla 4 [WABIM] — Clasificación de la condición del puente según D.T.A.%
// ---------------------------------------------------------------------------
const CONDITION_RANGES: Array<Omit<ConditionClassification, "condition"> & { condition: BridgeCondition }> = [
  {
    condition: "SIN_DETERIORO",
    label: "Sin deterioro",
    recommendation: "Programar mantenimiento preventivo a largo plazo.",
    color: "green",
    rangeLow: 0,
    rangeHigh: 10,
  },
  {
    condition: "DETERIORO_BAJO",
    label: "Deterioro bajo",
    recommendation:
      "Programar mantenimiento preventivo a mediano plazo; pueden requerirse algunas actividades correctivas puntuales.",
    color: "yellow",
    rangeLow: 10.1,
    rangeHigh: 40,
  },
  {
    condition: "DETERIORO_MODERADO",
    label: "Deterioro moderado",
    recommendation: "Programar mantenimiento correctivo y preventivo a corto plazo.",
    color: "orange",
    rangeLow: 40.1,
    rangeHigh: 50,
  },
  {
    condition: "DETERIORO_MEDIO_ALTO",
    label: "Deterioro medio-alto",
    recommendation: "Programar intervención inmediata, principalmente mantenimiento correctivo.",
    color: "red",
    rangeLow: 50.1,
    rangeHigh: 90,
  },
  {
    condition: "DETERIORO_ALTO",
    label: "Deterioro alto — susceptible de colapso",
    recommendation: "Estado de máximo riesgo: cerrar el uso de la estructura de inmediato.",
    color: "darkred",
    rangeLow: 90.1,
    rangeHigh: 100,
  },
];

export function classifyCondition(dta: number): ConditionClassification {
  const clamped = Math.max(0, Math.min(100, dta));
  const match =
    CONDITION_RANGES.find((r) => clamped >= r.rangeLow && clamped <= r.rangeHigh) ??
    CONDITION_RANGES[CONDITION_RANGES.length - 1];
  const { condition, label, recommendation, color, rangeLow, rangeHigh } = match;
  return { condition, label, recommendation, color, rangeLow, rangeHigh };
}

// ---------------------------------------------------------------------------
// Orquestador principal — ejecuta los 12 pasos documentados en la hoja
// "Pasos de cálculo" del Excel de referencia y produce un resultado con
// trazabilidad completa.
// ---------------------------------------------------------------------------
export function runWabimCalculation(
  input: WabimInspectionInput,
  lookups: WabimLookups = defaultLookups,
): WabimResult {
  const steps: string[] = [
    "1. Diligenciar el registro de daños (patologías) y las dimensiones totales de cada sub-elemento.",
    "2. Calcular la densidad de daño de cada patología: (medida del daño / medida total del sub-elemento) x 100 [Ec. 1].",
    "3. Definir el nivel de deterioro (Bajo/Medio/Alto) de cada patología según los rangos de la Tabla 6 [WABIM].",
    "4. Definir el Coeficiente de Densidad (D.C.) de cada patología: Bajo=1, Medio=2, Alto=3.",
    "5. Aplicar el Coeficiente de Importancia (I.C.) de cada sub-elemento (Tabla 1 [WABIM]).",
    "6. Calcular el Promedio Ponderado de cada patología: WAP = densidad x D.C. x I.C. [Ec. 2].",
    "7. Aplicar el Coeficiente de Elemento (E.C.) de cada elemento (Tabla 2 [WABIM]).",
    "8. Calcular el Grado de Afectación de cada Elemento: DAE% = ΣWAP / Σ(D.C. x I.C.) [Ec. 3].",
    "9. Reafirmar los Coeficientes de Elemento (E.C.) ya definidos en el paso 7 para la agregación por subcategoría.",
    "10. Calcular el Grado de Afectación de cada Subcategoría: DASC% = Σ(DAE x E.C.) / ΣE.C. [Ec. 4].",
    "11. Calcular el Grado de Afectación Total del puente: DTA% = Σ(DASC x C.E.C.) / ΣC.E.C. [Ec. 5].",
    "12. Clasificar la condición del puente y la recomendación de mantenimiento según la Tabla 4 [WABIM].",
  ];

  // Agrupar instancias de elemento por subcategoría según el catálogo.
  const elementResults = input.elements.map((el) => calculateElement(el, lookups));
  const bySubCategory = new Map<SubCategoryCode, ElementResult[]>();
  for (const sc of lookups.subCategoriesOrdered) bySubCategory.set(sc.code, []);
  for (const er of elementResults) {
    bySubCategory.get(er.subCategory)!.push(er);
  }

  const subCategoryResults = lookups.subCategoriesOrdered.map((sc) =>
    calculateSubCategory(sc.code, bySubCategory.get(sc.code) ?? [], lookups),
  );

  const { dta, sumDascCec, sumCec } = calculateTotalAffectation(subCategoryResults);
  const classification = classifyCondition(dta);

  return {
    inspectionId: input.inspectionId,
    subCategories: subCategoryResults,
    dta,
    sumDascCec,
    sumCec,
    classification,
    calculatedAt: new Date().toISOString(),
    steps,
  };
}

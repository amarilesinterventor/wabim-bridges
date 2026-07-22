/**
 * WABIM — Weighted Average Bridge Inspection Methodology
 * ------------------------------------------------------
 * Tipos de dominio para el motor de cálculo.
 *
 * Fuentes:
 *  [WABIM]  Amariles-López, C.C. & Osorio-Gómez, C.C. (2023). "Weighted
 *           Average Bridge Inspection Methodology (WABIM)". Revista DYNA,
 *           90(225), pp. 55-63.
 *  [INVIAS] INVÍAS / Universidad Nacional de Colombia (2006). "Manual para
 *           la Inspección Visual de Puentes y Pontones". Convenio 587-03.
 *
 * Estos tipos son deliberadamente independientes de cualquier framework
 * (no importan Prisma, Next.js, NestJS, etc.) para que el motor de cálculo
 * pueda incrustarse sin cambios en la arquitectura objetivo del proyecto
 * (Next.js/NestJS + PostgreSQL). Ver prisma/schema.prisma para el modelo
 * de persistencia equivalente.
 */

/** Nivel de severidad resultante de aplicar los rangos del Coeficiente de Densidad (D.C.) — Tabla 6 [WABIM]. */
export type SeverityLevel = "Bajo" | "Medio" | "Alto";

/**
 * Rangos que definen el Coeficiente de Densidad (D.C.) para un tipo de patología,
 * según Tabla 6 [WABIM] / Capítulos 3 y 4 [INVIAS].
 *
 * Semántica (igual a la hoja "Grado de afectación" del Excel de referencia):
 *   density <= lowMax        => "Bajo"  (D.C. = 1)
 *   lowMax < density < highMin (o density <= highMin, ver nota) => "Medio" (D.C. = 2)
 *   density >= highMin       => "Alto"  (D.C. = 3)
 *
 * lowMax y highMin se expresan en % (0-100), salvo que el campo `isPercentage`
 * sea false, en cuyo caso están en la unidad nativa de la patología (raro; el
 * manual INVÍAS siempre normaliza a %, ver Ecuación 1).
 */
export interface DensityThresholds {
  lowMax: number; // límite superior del rango "Bajo"
  highMin: number; // límite inferior del rango "Alto"
}

/** Unidad de cuantificación física de una patología (Anexo C [INVIAS]). */
export type MeasurementUnit =
  | "ml" // metros lineales
  | "m2" // metros cuadrados
  | "unidad" // conteo de unidades/elementos afectados
  | "%" // porcentaje directo (ya normalizado)
  | "mm"; // milímetros (usado solo como atributo descriptivo, p.ej. ancho de fisura)

/** Las 4 subcategorías estructurales de WABIM — Tabla 3 [WABIM] (C.E.C.). */
export type SubCategoryCode =
  | "SURFACE_EQUIPMENT" // Superficie y equipamiento
  | "SUBSTRUCTURE" // Subestructura
  | "CONCRETE_SUPERSTRUCTURE" // Superestructura en concreto
  | "STEEL_SUPERSTRUCTURE"; // Superestructura metálica

export interface SubCategoryDef {
  code: SubCategoryCode;
  name: string;
  /** Coeficiente de Elemento Categórico (C.E.C.) — Tabla 3 [WABIM]. Configurable por el administrador. */
  cec: number;
  source: "WABIM";
}

/** Un Elemento del puente (p.ej. "Juntas de expansión", "Pilas") — Tabla 2 [WABIM] (E.C.). */
export interface ElementDef {
  code: string;
  name: string;
  subCategory: SubCategoryCode;
  /** Coeficiente de Elemento (E.C.) — Tabla 2 [WABIM]. Configurable por el administrador. */
  ec: number;
  /**
   * "WABIM" = valor tomado literalmente de la Tabla 2 del artículo.
   * "EXTENSION" = elemento adicional requerido por el Manual INVÍAS para
   *   cobertura completa (p.ej. Cauce, Acceso peatonal) que WABIM no tabuló
   *   explícitamente; el coeficiente es una propuesta razonable y debe
   *   tratarse como configurable/auditable, nunca como dato original WABIM.
   */
  source: "WABIM" | "EXTENSION";
  /** Referencia a la sección del Manual INVÍAS donde se describe el elemento. */
  invias?: string;
}

/** Un Sub-elemento dentro de un Elemento (p.ej. "Sello" dentro de "Juntas de expansión") — Tabla 1 [WABIM] (I.C.). */
export interface SubElementDef {
  code: string;
  name: string;
  elementCode: string;
  /** Coeficiente de Importancia (I.C.) — Tabla 1 [WABIM]. Configurable por el administrador. */
  ic: number;
  /** Unidad en la que se mide la "dimensión total" del sub-elemento (denominador de la Ec. 1). */
  unit: MeasurementUnit;
  source: "WABIM" | "EXTENSION";
  invias?: string;
}

/** Un Tipo de Patología (daño) que puede afectar a un sub-elemento — Cap. 3 y 4 [INVIAS], Tabla 6 [WABIM]. */
export interface PathologyTypeDef {
  code: string; // p.ej. "FIF", "COL", "SOC" — códigos de convención del Manual INVIAS
  name: string;
  subElementCode: string;
  unit: MeasurementUnit;
  thresholds: DensityThresholds;
  /**
   * "WABIM": el código y su rango de densidad aparecen explícitamente en la Tabla 6.
   * "INVIAS": el código está definido y descrito en el Manual INVÍAS pero WABIM no le
   *   asignó una fila propia en la Tabla 6; se reutiliza el rango del grupo de
   *   patologías más cercano del propio artículo (se documenta cuál).
   * "EXTENSION": ni WABIM ni INVÍAS lo definen explícitamente con rango numérico;
   *   se propone un rango por defecto razonable, siempre editable por el administrador.
   */
  source: "WABIM" | "INVIAS" | "EXTENSION";
  note?: string;
}

/** Catálogo completo (snapshot inmutable) usado como semilla y como configuración por defecto. */
export interface WabimCatalog {
  subCategories: SubCategoryDef[];
  elements: ElementDef[];
  subElements: SubElementDef[];
  pathologyTypes: PathologyTypeDef[];
}

// ---------------------------------------------------------------------------
// Estructuras de entrada / salida del motor de cálculo
// ---------------------------------------------------------------------------

/**
 * Un registro de patología capturado en campo durante una inspección.
 *
 * `totalMeasure` (dimensión total / denominador de la Ec. 1) vive AQUÍ, no en
 * el sub-elemento: el Anexo C [INVIAS] asigna unidades distintas a patologías
 * del mismo sub-elemento (p.ej. en "Diseño" de un elemento de concreto,
 * Aplastamiento local se cuantifica en "unidad" pero Fisuras por flexión en
 * "ml"), así que un único total compartido por sub-elemento mezclaría
 * unidades incompatibles en la Ecuación 1.
 */
export interface PathologyRecordInput {
  id: string;
  pathologyCode: string;
  /** Medida cuantificada del daño, en la unidad de la patología (numerador Ec. 1). */
  measuredValue: number;
  /** Dimensión total de referencia para esta patología (denominador Ec. 1), en la misma unidad de la patología. */
  totalMeasure: number;
  /** Descripción libre, ubicación, severidad cualitativa adicional, fotos, etc. (no entran al cálculo). */
  description?: string;
  location?: string;
  photos?: string[];
}

/** Una instancia de sub-elemento presente en el puente durante una inspección (p.ej. "Sello" de la junta de entrada). */
export interface SubElementInstanceInput {
  id: string;
  subElementCode: string;
  label?: string; // p.ej. "Entrada", "Salida", "Pila 1"
  pathologies: PathologyRecordInput[];
}

/** Una instancia de elemento presente en el puente durante una inspección. */
export interface ElementInstanceInput {
  id: string;
  elementCode: string;
  label?: string;
  subElements: SubElementInstanceInput[];
}

/** Entrada completa de una inspección para el motor WABIM. */
export interface WabimInspectionInput {
  inspectionId: string;
  elements: ElementInstanceInput[];
}

// --- Resultados con trazabilidad completa (auditoría) ---------------------

export interface PathologyResult {
  pathologyRecordId: string;
  pathologyCode: string;
  pathologyName: string;
  measuredValue: number;
  totalMeasure: number;
  unit: MeasurementUnit;
  /** Ecuación 1: densidad de daño (%) */
  densityPct: number;
  severity: SeverityLevel;
  /** Coeficiente de Densidad resuelto (1, 2 o 3) */
  dc: number;
  thresholdsUsed: DensityThresholds;
  /** Coeficiente de Importancia del sub-elemento al que pertenece esta patología */
  ic: number;
  /** Ecuación 2: Promedio Ponderado de la Patología (W.A.P.) */
  wap: number;
}

export interface SubElementResult {
  subElementInstanceId: string;
  subElementCode: string;
  subElementName: string;
  ic: number;
  pathologies: PathologyResult[];
}

export interface ElementResult {
  elementInstanceId: string;
  elementCode: string;
  elementName: string;
  ec: number;
  subCategory: SubCategoryCode;
  subElements: SubElementResult[];
  /** Ecuación 3: Grado de Afectación del Elemento (D.A.E. %) */
  dae: number;
  /** Sumatorias intermedias, expuestas para auditoría */
  sumWap: number;
  sumDcIc: number;
  /** true si el elemento no tuvo ninguna patología registrada (sin datos => excluido de agregaciones superiores) */
  hasData: boolean;
}

export interface SubCategoryResult {
  subCategory: SubCategoryCode;
  subCategoryName: string;
  cec: number;
  elements: ElementResult[];
  /** Ecuación 4: Grado de Afectación de la Subcategoría (D.A.S.C. %) */
  dasc: number;
  sumDaeEc: number;
  sumEc: number;
  hasData: boolean;
}

export type BridgeCondition =
  | "SIN_DETERIORO"
  | "DETERIORO_BAJO"
  | "DETERIORO_MODERADO"
  | "DETERIORO_MEDIO_ALTO"
  | "DETERIORO_ALTO";

export interface ConditionClassification {
  condition: BridgeCondition;
  label: string;
  recommendation: string;
  /** color semáforo sugerido para UI/GIS */
  color: "green" | "yellow" | "orange" | "red" | "darkred";
  rangeLow: number;
  rangeHigh: number;
}

export interface WabimResult {
  inspectionId: string;
  subCategories: SubCategoryResult[];
  /** Ecuación 5: Grado de Afectación Total del puente (D.T.A. %) */
  dta: number;
  sumDascCec: number;
  sumCec: number;
  classification: ConditionClassification;
  calculatedAt: string;
  /** Traza completa de los 12 pasos, ver "Pasos de cálculo" en el Excel de referencia. */
  steps: string[];
}

/**
 * Catálogo WABIM / INVÍAS — datos de referencia
 * ---------------------------------------------
 * Este archivo contiene la totalidad de las Subcategorías, Elementos,
 * Sub-elementos y Tipos de Patología usados por el motor de cálculo,
 * junto con sus coeficientes (I.C., E.C., C.E.C.) y rangos de Coeficiente
 * de Densidad (D.C.).
 *
 * TRAZABILIDAD: cada entrada declara su `source`:
 *   - "WABIM"     -> tomado literalmente de Amariles-López & Osorio-Gómez (2023),
 *                    Tablas 1, 2, 3 y 6.
 *   - "INVIAS"    -> el elemento/patología está definido y descrito en el
 *                    Manual INVÍAS (2006) pero WABIM no le asignó un coeficiente
 *                    o rango propio; se reutiliza el del grupo más afín del
 *                    propio artículo (se documenta con `note`).
 *   - "EXTENSION" -> no aparece en ninguna de las dos fuentes con un valor
 *                    numérico explícito; se propone un valor por defecto
 *                    razonable para no perder cobertura del Manual INVÍAS
 *                    (p.ej. Cauce, Acceso peatonal, Superficie de rodadura).
 *                    TODO administrador: revisar y calibrar estos valores.
 *
 * Todos los coeficientes son editables en tiempo de ejecución desde el
 * módulo de administración (ver /admin.html y la tabla `subCategory` /
 * `elementType` / `subElementType` / `pathologyType` en prisma/schema.prisma).
 * Cuando se edita un coeficiente, el valor efectivamente usado en cada
 * cálculo se congela ("snapshot") en el resultado de la inspección para
 * no alterar retroactivamente inspecciones ya calculadas (auditoría).
 */

import type {
  WabimCatalog,
  SubCategoryDef,
  ElementDef,
  SubElementDef,
  PathologyTypeDef,
} from "./types.js";

// ---------------------------------------------------------------------------
// 1. Subcategorías — Tabla 3 [WABIM] (Categorical Element Coefficient, C.E.C.)
// ---------------------------------------------------------------------------
export const SUB_CATEGORIES: SubCategoryDef[] = [
  { code: "SURFACE_EQUIPMENT", name: "Superficie y equipamiento", cec: 2, source: "WABIM" },
  { code: "SUBSTRUCTURE", name: "Subestructura", cec: 5, source: "WABIM" },
  { code: "CONCRETE_SUPERSTRUCTURE", name: "Superestructura en concreto", cec: 5, source: "WABIM" },
  { code: "STEEL_SUPERSTRUCTURE", name: "Superestructura metálica", cec: 5, source: "WABIM" },
];

// ---------------------------------------------------------------------------
// 2. Elementos — Tabla 2 [WABIM] (Element Coefficient, E.C.) + Manual INVÍAS §2.4
// ---------------------------------------------------------------------------
export const ELEMENTS: ElementDef[] = [
  // --- Superficie y equipamiento ---
  { code: "SURFACE_PAVEMENT", name: "Superficie del puente y accesos", subCategory: "SURFACE_EQUIPMENT", ec: 2, source: "EXTENSION", invias: "§2.4.1 — remite al Manual de Inspección de Pavimentos INVÍAS (PCI); WABIM no lo tabula." },
  { code: "EXPANSION_JOINTS", name: "Juntas de expansión", subCategory: "SURFACE_EQUIPMENT", ec: 3, source: "WABIM", invias: "§2.4.2" },
  { code: "SIDEWALKS_CURBS", name: "Andenes / Bordillos", subCategory: "SURFACE_EQUIPMENT", ec: 1, source: "WABIM", invias: "§2.4.3" },
  { code: "RAILINGS", name: "Barandas", subCategory: "SURFACE_EQUIPMENT", ec: 2, source: "WABIM", invias: "§2.4.4" },
  { code: "LIGHTING", name: "Iluminación", subCategory: "SURFACE_EQUIPMENT", ec: 1, source: "EXTENSION", invias: "§2.4.5 — verificación binaria de funcionamiento, WABIM no lo tabula." },
  { code: "SIGNALING", name: "Señalización", subCategory: "SURFACE_EQUIPMENT", ec: 2, source: "WABIM", invias: "§2.4.6" },
  { code: "DRAINAGE", name: "Drenaje", subCategory: "SURFACE_EQUIPMENT", ec: 4, source: "WABIM", invias: "§2.4.7" },

  // --- Subestructura ---
  { code: "WING_WALLS", name: "Aletas", subCategory: "SUBSTRUCTURE", ec: 4, source: "WABIM", invias: "§2.4.10" },
  { code: "ABUTMENTS", name: "Estribos", subCategory: "SUBSTRUCTURE", ec: 4, source: "WABIM", invias: "§2.4.10" },
  { code: "PIERS", name: "Pilas", subCategory: "SUBSTRUCTURE", ec: 2, source: "WABIM", invias: "§2.4.11" },
  { code: "RIVERBED", name: "Cauce", subCategory: "SUBSTRUCTURE", ec: 3, source: "EXTENSION", invias: "§2.4.21 — socavación/estabilidad del cauce; WABIM no lo tabula como elemento propio (SOC se aplica a estribos/pilas/aletas)." },

  // --- Superestructura en concreto ---
  { code: "SLAB", name: "Losa", subCategory: "CONCRETE_SUPERSTRUCTURE", ec: 3, source: "WABIM", invias: "§2.4.12" },
  { code: "CONCRETE_BEAMS", name: "Vigas (concreto)", subCategory: "CONCRETE_SUPERSTRUCTURE", ec: 5, source: "WABIM", invias: "§2.4.12" },
  { code: "STRUTS_DIAPHRAGMS_CONCRETE", name: "Riostras / Diafragmas (concreto)", subCategory: "CONCRETE_SUPERSTRUCTURE", ec: 3, source: "WABIM", invias: "§2.4.12" },
  { code: "SUPPORTS", name: "Apoyos", subCategory: "CONCRETE_SUPERSTRUCTURE", ec: 5, source: "WABIM", invias: "§2.4.8" },
  { code: "CONCRETE_ARCHES", name: "Arcos en mampostería y concreto", subCategory: "CONCRETE_SUPERSTRUCTURE", ec: 5, source: "WABIM", invias: "§2.4.13" },
  { code: "PEDESTRIAN_ACCESS", name: "Acceso peatonal", subCategory: "CONCRETE_SUPERSTRUCTURE", ec: 2, source: "EXTENSION", invias: "§2.4.19 — WABIM no lo tabula." },

  // --- Superestructura metálica ---
  { code: "STEEL_ARCHES", name: "Arcos metálicos", subCategory: "STEEL_SUPERSTRUCTURE", ec: 5, source: "WABIM", invias: "§2.4.13" },
  { code: "STEEL_PROFILES", name: "Perfiles metálicos", subCategory: "STEEL_SUPERSTRUCTURE", ec: 4, source: "WABIM", invias: "§2.4.16" },
  { code: "STEEL_TRUSSES", name: "Elementos de armadura", subCategory: "STEEL_SUPERSTRUCTURE", ec: 4, source: "WABIM", invias: "§2.4.17" },
  { code: "STEEL_CONNECTIONS", name: "Conexiones en estructura metálica", subCategory: "STEEL_SUPERSTRUCTURE", ec: 5, source: "WABIM", invias: "§2.4.18" },
  { code: "CABLES_STRUTS_TOWERS", name: "Cables / Pendolones / Torres", subCategory: "STEEL_SUPERSTRUCTURE", ec: 3, source: "WABIM", invias: "§2.4.15" },
];

// ---------------------------------------------------------------------------
// 3. Sub-elementos — Tabla 1 [WABIM] (Importance Coefficient, I.C.)
// ---------------------------------------------------------------------------
// Nota sobre elementos de concreto reforzado (Aletas, Estribos, Pilas, Losa,
// Vigas, Riostras, Arcos de concreto): el Manual INVÍAS (§2.4.9) los agrupa
// bajo 3 categorías comunes de daño — "Diseño", "Construcción", "Funcionamiento"
// — y WABIM (Tabla 1, fila "Concrete structures") asigna I.C. = 3 / 4 / 2
// respectivamente a esas 3 categorías. Por eso se modelan como 3 sub-elementos
// repetidos en cada uno de esos elementos.
const CONCRETE_DESIGN_CONSTRUCTION_OPERATION = (elementCode: string): SubElementDef[] => [
  { code: `${elementCode}__DESIGN`, name: "Diseño", elementCode, ic: 3, unit: "unidad", source: "WABIM", invias: "§3.1 — Tabla 1 [WABIM]: 'Concrete structures / Design' I.C.=3" },
  { code: `${elementCode}__CONSTRUCTION`, name: "Construcción", elementCode, ic: 4, unit: "m2", source: "WABIM", invias: "§3.2 — Tabla 1 [WABIM]: 'Concrete structures / Construction' I.C.=4" },
  { code: `${elementCode}__OPERATION`, name: "Funcionamiento", elementCode, ic: 2, unit: "m2", source: "WABIM", invias: "§3.3 — Tabla 1 [WABIM]: 'Concrete structures / Operation' I.C.=2" },
];

// Nota sobre elementos de superestructura metálica (arcos, perfiles, armaduras):
// el Manual INVÍAS (§2.4.14) los agrupa por "elemento afectado" (p.ej. cordón,
// diagonal, montante) con hasta 3-4 componentes + "otros"; para el cálculo WABIM
// se usa el I.C. propio de cada sub-elemento según Tabla 1.
export const SUB_ELEMENTS: SubElementDef[] = [
  // Superficie del puente (extensión)
  { code: "SURFACE_PAVEMENT__SURFACE", name: "Superficie de rodadura", elementCode: "SURFACE_PAVEMENT", ic: 3, unit: "m2", source: "EXTENSION" },

  // Juntas de expansión — Tabla 1 [WABIM]
  { code: "EXPANSION_JOINTS__SEALANT", name: "Sello", elementCode: "EXPANSION_JOINTS", ic: 4, unit: "ml", source: "WABIM" },
  { code: "EXPANSION_JOINTS__PROFILE", name: "Perfil", elementCode: "EXPANSION_JOINTS", ic: 2, unit: "ml", source: "WABIM" },
  { code: "EXPANSION_JOINTS__CORNER_GUARD", name: "Guardacanto", elementCode: "EXPANSION_JOINTS", ic: 2, unit: "ml", source: "WABIM" },

  // Andenes / Bordillos — Tabla 1 [WABIM]
  { code: "SIDEWALKS_CURBS__CORNER_CHIPPING", name: "Desportillamiento de esquina", elementCode: "SIDEWALKS_CURBS", ic: 2, unit: "ml", source: "WABIM" },
  { code: "SIDEWALKS_CURBS__EXPOSED_STEEL", name: "Acero expuesto", elementCode: "SIDEWALKS_CURBS", ic: 3, unit: "ml", source: "WABIM" },
  { code: "SIDEWALKS_CURBS__INSUFFICIENT_DIM", name: "Dimensiones insuficientes", elementCode: "SIDEWALKS_CURBS", ic: 3, unit: "ml", source: "WABIM" },

  // Barandas — Tabla 1 [WABIM]
  { code: "RAILINGS__PAINT", name: "Pintura", elementCode: "RAILINGS", ic: 1, unit: "ml", source: "WABIM" },
  { code: "RAILINGS__POLES", name: "Postes", elementCode: "RAILINGS", ic: 2, unit: "ml", source: "WABIM" },
  { code: "RAILINGS__RAILING", name: "Pasamanos", elementCode: "RAILINGS", ic: 3, unit: "ml", source: "WABIM" },

  // Iluminación (extensión)
  { code: "LIGHTING__FIXTURES", name: "Luminarias", elementCode: "LIGHTING", ic: 1, unit: "unidad", source: "EXTENSION" },

  // Señalización — Tabla 1 [WABIM]
  { code: "SIGNALING__HORIZONTAL", name: "Horizontal", elementCode: "SIGNALING", ic: 2, unit: "ml", source: "WABIM" },
  { code: "SIGNALING__VERTICAL", name: "Vertical", elementCode: "SIGNALING", ic: 3, unit: "unidad", source: "WABIM" },
  { code: "SIGNALING__REDUCERS", name: "Reductores", elementCode: "SIGNALING", ic: 1, unit: "unidad", source: "WABIM" },

  // Drenaje — Tabla 1 [WABIM] (aquí el sub-elemento y la patología casi coinciden; ver catálogo de patologías)
  { code: "DRAINAGE__PLUGGED", name: "Taponamiento", elementCode: "DRAINAGE", ic: 2, unit: "unidad", source: "WABIM" },
  { code: "DRAINAGE__ABSENCE", name: "Ausencia", elementCode: "DRAINAGE", ic: 5, unit: "unidad", source: "WABIM" },
  { code: "DRAINAGE__INSUFFICIENT_LENGTH", name: "Longitud insuficiente", elementCode: "DRAINAGE", ic: 3, unit: "unidad", source: "WABIM" },

  // Cauce (extensión)
  { code: "RIVERBED__BANKS_BED", name: "Márgenes y lecho", elementCode: "RIVERBED", ic: 4, unit: "m2", source: "EXTENSION" },
  { code: "RIVERBED__SLOPES", name: "Taludes", elementCode: "RIVERBED", ic: 3, unit: "m2", source: "EXTENSION" },
  { code: "RIVERBED__OBSTRUCTION", name: "Obstrucción del cauce", elementCode: "RIVERBED", ic: 3, unit: "m2", source: "EXTENSION" },

  // Elementos de concreto reforzado (Diseño/Construcción/Funcionamiento)
  ...CONCRETE_DESIGN_CONSTRUCTION_OPERATION("WING_WALLS"),
  ...CONCRETE_DESIGN_CONSTRUCTION_OPERATION("ABUTMENTS"),
  ...CONCRETE_DESIGN_CONSTRUCTION_OPERATION("PIERS"),
  ...CONCRETE_DESIGN_CONSTRUCTION_OPERATION("SLAB"),
  ...CONCRETE_DESIGN_CONSTRUCTION_OPERATION("CONCRETE_BEAMS"),
  ...CONCRETE_DESIGN_CONSTRUCTION_OPERATION("STRUTS_DIAPHRAGMS_CONCRETE"),
  ...CONCRETE_DESIGN_CONSTRUCTION_OPERATION("CONCRETE_ARCHES"),

  // Apoyos — no tabulado con I.C. propio en WABIM; se usa I.C.=3 (extensión, elemento crítico)
  { code: "SUPPORTS__SUPPORT", name: "Apoyo", elementCode: "SUPPORTS", ic: 3, unit: "unidad", source: "EXTENSION", invias: "§2.4.8 — Tabla 7. WABIM no asigna I.C. propio a 'Apoyos' como sub-elemento; sí lo pondera como Elemento (E.C.=5, Tabla 2)." },

  // Acceso peatonal (extensión)
  { code: "PEDESTRIAN_ACCESS__SLAB_STEPS", name: "Peldaños / Losa", elementCode: "PEDESTRIAN_ACCESS", ic: 3, unit: "ml", source: "EXTENSION" },
  { code: "PEDESTRIAN_ACCESS__GIRDER", name: "Viga guardera", elementCode: "PEDESTRIAN_ACCESS", ic: 3, unit: "ml", source: "EXTENSION" },
  { code: "PEDESTRIAN_ACCESS__RAMP", name: "Rampa", elementCode: "PEDESTRIAN_ACCESS", ic: 2, unit: "ml", source: "EXTENSION" },

  // Arcos metálicos — Tabla 1 [WABIM] "Steel arches"
  { code: "STEEL_ARCHES__ARCH", name: "Arco (izquierdo/derecho)", elementCode: "STEEL_ARCHES", ic: 4, unit: "unidad", source: "WABIM" },
  { code: "STEEL_ARCHES__LATERAL_BRACING", name: "Arriostramiento lateral", elementCode: "STEEL_ARCHES", ic: 2, unit: "unidad", source: "WABIM" },

  // Perfiles metálicos — Tabla 1 [WABIM] "Steel profiles"
  { code: "STEEL_PROFILES__BEAMS", name: "Vigas", elementCode: "STEEL_PROFILES", ic: 4, unit: "unidad", source: "WABIM" },
  { code: "STEEL_PROFILES__STRINGER", name: "Largueros", elementCode: "STEEL_PROFILES", ic: 3, unit: "unidad", source: "WABIM" },
  { code: "STEEL_PROFILES__DIAPHRAGMS", name: "Diafragmas", elementCode: "STEEL_PROFILES", ic: 2, unit: "unidad", source: "WABIM" },

  // Armaduras (steel trusses) — Tabla 1 [WABIM] "Steel trusses"
  { code: "STEEL_TRUSSES__CORDS", name: "Cordones", elementCode: "STEEL_TRUSSES", ic: 3, unit: "unidad", source: "WABIM" },
  { code: "STEEL_TRUSSES__UPRIGHTS", name: "Montantes", elementCode: "STEEL_TRUSSES", ic: 4, unit: "unidad", source: "WABIM" },
  { code: "STEEL_TRUSSES__DIAGONALS", name: "Diagonales", elementCode: "STEEL_TRUSSES", ic: 2, unit: "unidad", source: "WABIM" },

  // Conexiones en estructura metálica — Tabla 1 [WABIM] "Steel connections"
  { code: "STEEL_CONNECTIONS__WELDING", name: "Soldadura", elementCode: "STEEL_CONNECTIONS", ic: 4, unit: "unidad", source: "WABIM" },
  { code: "STEEL_CONNECTIONS__CONNECTORS", name: "Conectores (pernos/remaches)", elementCode: "STEEL_CONNECTIONS", ic: 2, unit: "unidad", source: "WABIM" },
  { code: "STEEL_CONNECTIONS__PINS", name: "Pasadores", elementCode: "STEEL_CONNECTIONS", ic: 1, unit: "unidad", source: "WABIM" },

  // Cables / Pendolones / Torres — Tabla 1 [WABIM] "Cables/Struts/Towers"
  { code: "CABLES_STRUTS_TOWERS__CABLES", name: "Cables", elementCode: "CABLES_STRUTS_TOWERS", ic: 3, unit: "ml", source: "WABIM" },
  { code: "CABLES_STRUTS_TOWERS__STRUTS", name: "Pendolones", elementCode: "CABLES_STRUTS_TOWERS", ic: 4, unit: "unidad", source: "WABIM" },
  { code: "CABLES_STRUTS_TOWERS__TOWERS", name: "Torres", elementCode: "CABLES_STRUTS_TOWERS", ic: 2, unit: "unidad", source: "WABIM" },
];

// ---------------------------------------------------------------------------
// 4. Tipos de Patología — Tabla 6 [WABIM] + Cap. 3/4 [INVIAS] + Anexo C
// ---------------------------------------------------------------------------
const T = (lowMax: number, highMin: number) => ({ lowMax, highMin });

export const PATHOLOGY_TYPES: PathologyTypeDef[] = [
  // --- Superficie de rodadura (extensión, remite a PCI) ---
  { code: "PAV_DET", name: "Deterioro superficial de pavimento", subElementCode: "SURFACE_PAVEMENT__SURFACE", unit: "m2", thresholds: T(15, 30), source: "EXTENSION", note: "Remite al Manual de Inspección de Pavimentos INVÍAS (PCI); umbral propuesto." },

  // --- Juntas de expansión / Sello — Tabla 6 [WABIM] "Sealant" <5% / 5-25% / >25% ---
  { code: "OB", name: "Obstrucción del sello", subElementCode: "EXPANSION_JOINTS__SEALANT", unit: "ml", thresholds: T(5, 25), source: "WABIM" },
  { code: "RU", name: "Ruptura del sello", subElementCode: "EXPANSION_JOINTS__SEALANT", unit: "ml", thresholds: T(5, 25), source: "WABIM" },
  { code: "AUS", name: "Ausencia del sello", subElementCode: "EXPANSION_JOINTS__SEALANT", unit: "ml", thresholds: T(5, 25), source: "WABIM" },

  // --- Juntas de expansión / Perfil — Tabla 6 [WABIM] "Profile" tiene 2 filas (<20/20-50/>50 y <3/3-7/>7).
  // Se asigna la fila de mayor tolerancia a daños de anclaje/soldadura (rango de %area) y la más estricta
  // a defectos puntuales de perfil (rango pensado como fracción del perímetro soldado). Ver nota.
  { code: "SOL_JUNTA", name: "Agrietamiento de soldaduras", subElementCode: "EXPANSION_JOINTS__PROFILE", unit: "ml", thresholds: T(20, 50), source: "WABIM", note: "Tabla 6 'Profile', primera fila." },
  { code: "AUA", name: "Ausencia de anclajes", subElementCode: "EXPANSION_JOINTS__PROFILE", unit: "ml", thresholds: T(20, 50), source: "WABIM", note: "Tabla 6 'Profile', primera fila." },
  { code: "PD", name: "Perfiles defectuosos", subElementCode: "EXPANSION_JOINTS__PROFILE", unit: "ml", thresholds: T(3, 7), source: "WABIM", note: "Tabla 6 'Profile', segunda fila." },
  { code: "PS", name: "Perfiles sueltos", subElementCode: "EXPANSION_JOINTS__PROFILE", unit: "ml", thresholds: T(3, 7), source: "WABIM", note: "Tabla 6 'Profile', segunda fila." },

  // --- Juntas de expansión / Guardacanto — Tabla 6 [WABIM] "Corner guard" <15/15-30/>30 ---
  { code: "DGG", name: "Desgaste de guardacanto", subElementCode: "EXPANSION_JOINTS__CORNER_GUARD", unit: "ml", thresholds: T(15, 30), source: "WABIM" },
  { code: "DPG", name: "Desportillamiento de guardacanto", subElementCode: "EXPANSION_JOINTS__CORNER_GUARD", unit: "ml", thresholds: T(15, 30), source: "WABIM" },
  { code: "FIG", name: "Fisuramiento de guardacanto", subElementCode: "EXPANSION_JOINTS__CORNER_GUARD", unit: "ml", thresholds: T(15, 30), source: "WABIM" },

  // --- Andenes/Bordillos — Tabla 6 [WABIM] "Platforms/kerbstone" <15/15-30/>30 (los 3 sub-daños) ---
  { code: "DESP_ANDEN", name: "Desportillamiento / agrietamiento", subElementCode: "SIDEWALKS_CURBS__CORNER_CHIPPING", unit: "ml", thresholds: T(15, 30), source: "WABIM" },
  { code: "ACERO_EXP_ANDEN", name: "Acero expuesto y corrosión", subElementCode: "SIDEWALKS_CURBS__EXPOSED_STEEL", unit: "ml", thresholds: T(15, 30), source: "WABIM" },
  { code: "DIM_INSUF_ANDEN", name: "Dimensiones insuficientes", subElementCode: "SIDEWALKS_CURBS__INSUFFICIENT_DIM", unit: "ml", thresholds: T(30, 60), source: "WABIM", note: "Tabla 6: 'Insufficient dimensions' <30/30-60/>60." },

  // --- Barandas — Tabla 6 [WABIM]: Paint/Poles <30/30-60/>60; Railing <20/20-40/>40 ---
  { code: "DE", name: "Delaminación de la pintura", subElementCode: "RAILINGS__PAINT", unit: "ml", thresholds: T(30, 60), source: "WABIM" },
  { code: "AUP_PINTURA", name: "Ausencia de pintura", subElementCode: "RAILINGS__PAINT", unit: "ml", thresholds: T(30, 60), source: "WABIM" },
  { code: "DT", name: "Deterioro general de pintura", subElementCode: "RAILINGS__PAINT", unit: "ml", thresholds: T(30, 60), source: "WABIM" },
  { code: "FRP", name: "Fracturamiento de postes", subElementCode: "RAILINGS__POLES", unit: "ml", thresholds: T(30, 60), source: "WABIM" },
  { code: "AUP_POSTES", name: "Ausencia de postes", subElementCode: "RAILINGS__POLES", unit: "ml", thresholds: T(30, 60), source: "WABIM" },
  { code: "GIV_POSTES", name: "Golpes por impacto vehicular", subElementCode: "RAILINGS__POLES", unit: "ml", thresholds: T(30, 60), source: "WABIM" },
  { code: "COP", name: "Corrosión del pasamanos", subElementCode: "RAILINGS__RAILING", unit: "ml", thresholds: T(20, 40), source: "WABIM" },
  { code: "AUE", name: "Ausencia de elementos", subElementCode: "RAILINGS__RAILING", unit: "ml", thresholds: T(20, 40), source: "WABIM" },
  { code: "GIV_PASAMANOS", name: "Golpes por impacto", subElementCode: "RAILINGS__RAILING", unit: "ml", thresholds: T(20, 40), source: "WABIM" },

  // --- Iluminación (extensión) ---
  { code: "LUZ_FALLA", name: "Luminaria no funcional", subElementCode: "LIGHTING__FIXTURES", unit: "unidad", thresholds: T(20, 50), source: "EXTENSION" },

  // --- Señalización — Tabla 6 [WABIM] <20/20-40/>40 para los 3 tipos ---
  { code: "IL", name: "Ilegibilidad", subElementCode: "SIGNALING__HORIZONTAL", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "RR", name: "Retrorreflectividad deficiente", subElementCode: "SIGNALING__HORIZONTAL", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "FA", name: "Falta de adherencia", subElementCode: "SIGNALING__HORIZONTAL", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "DD", name: "Demarcaciones defectuosas", subElementCode: "SIGNALING__HORIZONTAL", unit: "ml", thresholds: T(20, 40), source: "WABIM" },
  { code: "IVN", name: "Invisibilidad / obstrucción vegetal", subElementCode: "SIGNALING__VERTICAL", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "AE", name: "Daño por agentes externos / vandalismo", subElementCode: "SIGNALING__VERTICAL", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "AE_REDUCTOR", name: "Daño por agentes externos", subElementCode: "SIGNALING__REDUCERS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },

  // --- Drenaje — Tabla 6 [WABIM] <15/15-30/>30 ---
  { code: "DREN_TAPONADO", name: "Taponamiento", subElementCode: "DRAINAGE__PLUGGED", unit: "unidad", thresholds: T(15, 30), source: "WABIM" },
  { code: "DREN_AUSENCIA", name: "Ausencia de drenaje", subElementCode: "DRAINAGE__ABSENCE", unit: "unidad", thresholds: T(15, 30), source: "WABIM" },
  { code: "DREN_LONG_INSUF", name: "Longitud insuficiente", subElementCode: "DRAINAGE__INSUFFICIENT_LENGTH", unit: "unidad", thresholds: T(15, 30), source: "WABIM" },

  // --- Cauce (extensión) ---
  { code: "SOC_CAUCE", name: "Socavación general del cauce", subElementCode: "RIVERBED__BANKS_BED", unit: "m2", thresholds: T(15, 30), source: "EXTENSION" },
  { code: "EROSION_MARGEN", name: "Erosión de márgenes", subElementCode: "RIVERBED__BANKS_BED", unit: "m2", thresholds: T(15, 30), source: "EXTENSION" },
  { code: "INESTAB_TALUD", name: "Inestabilidad de taludes", subElementCode: "RIVERBED__SLOPES", unit: "m2", thresholds: T(15, 30), source: "EXTENSION" },
  { code: "OBSTRUCCION_CAUCE", name: "Obstrucción por escombros/vegetación", subElementCode: "RIVERBED__OBSTRUCTION", unit: "m2", thresholds: T(15, 30), source: "EXTENSION" },

  // === Patologías comunes de concreto reforzado (Diseño/Construcción/Funcionamiento) ===
  // Se generan para cada elemento de concreto mediante `concretePathologies()` más abajo.

  // --- Apoyos — Tabla 7 [INVIAS], sin rango WABIM explícito (extensión) ---
  { code: "DZ", name: "Desplazamiento", subElementCode: "SUPPORTS__SUPPORT", unit: "unidad", thresholds: T(15, 30), source: "EXTENSION" },
  { code: "DF", name: "Deformación excesiva", subElementCode: "SUPPORTS__SUPPORT", unit: "unidad", thresholds: T(15, 30), source: "EXTENSION" },
  { code: "DESCOMP_APOYO", name: "Descomposición", subElementCode: "SUPPORTS__SUPPORT", unit: "unidad", thresholds: T(15, 30), source: "EXTENSION" },

  // --- Acceso peatonal (extensión) ---
  { code: "ACC_FISURA", name: "Fisuras / acero expuesto", subElementCode: "PEDESTRIAN_ACCESS__SLAB_STEPS", unit: "ml", thresholds: T(15, 30), source: "EXTENSION" },
  { code: "ACC_CORROSION", name: "Corrosión de la estructura metálica", subElementCode: "PEDESTRIAN_ACCESS__GIRDER", unit: "unidad", thresholds: T(15, 30), source: "EXTENSION" },
  { code: "ACC_DESPLAZ", name: "Desplazamiento relativo", subElementCode: "PEDESTRIAN_ACCESS__RAMP", unit: "ml", thresholds: T(15, 30), source: "EXTENSION" },

  // === Superestructura metálica: Arcos, Perfiles, Armaduras ===
  // Tabla 6 [WABIM]: "COL-COM-COS-PI-PGL-DX" <15/15-30/>30 ; "FIV" <10/10-30/>30 ; "IMP" <20/20-40/>40
  // Se instancian para cada sub-elemento metálico mediante `steelPathologies()` más abajo.

  // --- Conexiones en estructura metálica — Tabla 6 [WABIM] "Steel connections" <20/20-40/>40 ---
  { code: "AUC", name: "Ausencia o mal estado de conectores", subElementCode: "STEEL_CONNECTIONS__CONNECTORS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "EX", name: "Excentricidad", subElementCode: "STEEL_CONNECTIONS__CONNECTORS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "TP", name: "Falla por tensión en la platina", subElementCode: "STEEL_CONNECTIONS__CONNECTORS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "AP", name: "Aplastamiento de la platina", subElementCode: "STEEL_CONNECTIONS__CONNECTORS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "DG", name: "Falla por desgarramiento", subElementCode: "STEEL_CONNECTIONS__CONNECTORS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "CT", name: "Falla por corte en el conector", subElementCode: "STEEL_CONNECTIONS__CONNECTORS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "BQ", name: "Falla por bloque de cortante", subElementCode: "STEEL_CONNECTIONS__CONNECTORS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "SOL", name: "Rotura de la soldadura", subElementCode: "STEEL_CONNECTIONS__WELDING", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },

  // --- Cables/Pendolones/Torres — Tabla 6 [WABIM] <10/10-30/>30 (PRC,TEC,FIA,FIM,CTA) y <20/20-40/>40 (PL,PGL,FIV,DX) ---
  { code: "PRC", name: "Pérdida de recubrimiento de cables", subElementCode: "CABLES_STRUTS_TOWERS__CABLES", unit: "ml", thresholds: T(10, 30), source: "WABIM" },
  { code: "TEC", name: "Pérdida de tensión de cables/pendolones", subElementCode: "CABLES_STRUTS_TOWERS__CABLES", unit: "unidad", thresholds: T(10, 30), source: "WABIM" },
  { code: "FIA", name: "Fisuras en los alambres", subElementCode: "CABLES_STRUTS_TOWERS__CABLES", unit: "unidad", thresholds: T(10, 30), source: "WABIM" },
  { code: "FIM", name: "Fisuras en los muertos de anclaje", subElementCode: "CABLES_STRUTS_TOWERS__STRUTS", unit: "unidad", thresholds: T(10, 30), source: "WABIM" },
  { code: "CTA", name: "Contaminación en zona de anclajes", subElementCode: "CABLES_STRUTS_TOWERS__STRUTS", unit: "unidad", thresholds: T(10, 30), source: "WABIM" },
  { code: "PL_TORRE", name: "Pandeo local", subElementCode: "CABLES_STRUTS_TOWERS__TOWERS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "PGL_TORRE", name: "Pandeo general lateral", subElementCode: "CABLES_STRUTS_TOWERS__TOWERS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "FIV_TORRE", name: "Fisuras longitudinales/transversales", subElementCode: "CABLES_STRUTS_TOWERS__TOWERS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  { code: "DX_TORRE", name: "Deflexión excesiva", subElementCode: "CABLES_STRUTS_TOWERS__TOWERS", unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
];

/** Genera las 7 patologías comunes por Diseño/Construcción/Funcionamiento para un elemento de concreto dado. */
function concretePathologies(elementCode: string, prefix: string): PathologyTypeDef[] {
  return [
    // Diseño — Tabla 6 [WABIM] "AL, AL, VO" <15/15-30/>30 ; también se agrupa AS por afinidad (asentamientos)
    { code: `${prefix}_AL`, name: "Aplastamiento local", subElementCode: `${elementCode}__DESIGN`, unit: "unidad", thresholds: T(15, 30), source: "WABIM" },
    { code: `${prefix}_VO`, name: "Volcamiento", subElementCode: `${elementCode}__DESIGN`, unit: "unidad", thresholds: T(15, 30), source: "WABIM" },
    { code: `${prefix}_AS`, name: "Asentamientos", subElementCode: `${elementCode}__DESIGN`, unit: "unidad", thresholds: T(15, 30), source: "INVIAS", note: "§3.1.3 — sin fila propia en Tabla 6; se agrupa con AL/VO por afinidad de causa (falla de diseño de cimentación)." },
    // FIF/FIC/FIT — Tabla 6 [WABIM] <10/10-30/>30 (fila "FIF, F.I.C., F.I.T.")
    { code: `${prefix}_FIF`, name: "Fisuras por flexión", subElementCode: `${elementCode}__DESIGN`, unit: "ml", thresholds: T(10, 30), source: "WABIM" },
    { code: `${prefix}_FIC`, name: "Fisuras por cortante", subElementCode: `${elementCode}__DESIGN`, unit: "ml", thresholds: T(10, 30), source: "WABIM" },
    { code: `${prefix}_FIT`, name: "Fisuras por torsión", subElementCode: `${elementCode}__DESIGN`, unit: "ml", thresholds: T(10, 30), source: "WABIM" },

    // Construcción — Tabla 6 [WABIM] "S.E., H.O., F.I.R., J.F., RE, E.X.A." <5/5-25/>25
    { code: `${prefix}_SE`, name: "Segregación", subElementCode: `${elementCode}__CONSTRUCTION`, unit: "m2", thresholds: T(5, 25), source: "WABIM" },
    { code: `${prefix}_HO`, name: "Hormigueros", subElementCode: `${elementCode}__CONSTRUCTION`, unit: "m2", thresholds: T(5, 25), source: "WABIM" },
    { code: `${prefix}_FIR`, name: "Fisuración por retracción", subElementCode: `${elementCode}__CONSTRUCTION`, unit: "m2", thresholds: T(5, 25), source: "WABIM" },
    { code: `${prefix}_JF`, name: "Juntas frías inadecuadas", subElementCode: `${elementCode}__CONSTRUCTION`, unit: "ml", thresholds: T(5, 25), source: "WABIM" },
    { code: `${prefix}_RE`, name: "Recubrimiento inadecuado", subElementCode: `${elementCode}__CONSTRUCTION`, unit: "m2", thresholds: T(5, 25), source: "WABIM" },
    { code: `${prefix}_EXA`, name: "Exposición del acero de refuerzo", subElementCode: `${elementCode}__CONSTRUCTION`, unit: "m2", thresholds: T(5, 25), source: "WABIM" },

    // Funcionamiento — Tabla 6 [WABIM] "IN, E.F., C.A.R., C.O.A., C.T.C., I.M.P., S.O.C." <20/20-50/>50
    { code: `${prefix}_IN`, name: "Infiltración", subElementCode: `${elementCode}__OPERATION`, unit: "m2", thresholds: T(20, 50), source: "WABIM" },
    { code: `${prefix}_EF`, name: "Eflorescencias", subElementCode: `${elementCode}__OPERATION`, unit: "m2", thresholds: T(20, 50), source: "WABIM" },
    { code: `${prefix}_CAR`, name: "Carbonatación", subElementCode: `${elementCode}__OPERATION`, unit: "m2", thresholds: T(20, 50), source: "WABIM" },
    { code: `${prefix}_COA`, name: "Corrosión de la armadura", subElementCode: `${elementCode}__OPERATION`, unit: "m2", thresholds: T(20, 50), source: "WABIM" },
    { code: `${prefix}_CTC`, name: "Contaminación del concreto", subElementCode: `${elementCode}__OPERATION`, unit: "m2", thresholds: T(20, 50), source: "WABIM" },
    { code: `${prefix}_IMP`, name: "Fallas por impacto", subElementCode: `${elementCode}__OPERATION`, unit: "m2", thresholds: T(20, 50), source: "WABIM" },
    { code: `${prefix}_SOC`, name: "Socavación", subElementCode: `${elementCode}__OPERATION`, unit: "m2", thresholds: T(20, 50), source: "WABIM" },
  ];
}

/** Genera las patologías metálicas comunes (Tabla 6 [WABIM]) para un sub-elemento dado. */
function steelPathologies(subElementCode: string, prefix: string): PathologyTypeDef[] {
  return [
    { code: `${prefix}_COL`, name: "Corrosión leve", subElementCode, unit: "unidad", thresholds: T(15, 30), source: "WABIM" },
    { code: `${prefix}_COM`, name: "Corrosión media", subElementCode, unit: "unidad", thresholds: T(15, 30), source: "WABIM" },
    { code: `${prefix}_COS`, name: "Corrosión severa", subElementCode, unit: "unidad", thresholds: T(15, 30), source: "WABIM" },
    { code: `${prefix}_PI`, name: "Pintura deteriorada", subElementCode, unit: "%", thresholds: T(15, 30), source: "WABIM" },
    { code: `${prefix}_PGL`, name: "Pandeo general lateral", subElementCode, unit: "unidad", thresholds: T(15, 30), source: "WABIM" },
    { code: `${prefix}_PL`, name: "Pandeo local", subElementCode, unit: "unidad", thresholds: T(15, 30), source: "INVIAS", note: "§4.4.1 — agrupado con COL/COM/COS/PI/PGL/DX por afinidad (Tabla 6)." },
    { code: `${prefix}_DX`, name: "Deflexión excesiva", subElementCode, unit: "unidad", thresholds: T(15, 30), source: "WABIM" },
    { code: `${prefix}_FIV`, name: "Fisuras en vigas long./transv.", subElementCode, unit: "unidad", thresholds: T(10, 30), source: "WABIM" },
    { code: `${prefix}_IMP`, name: "Fallas por impacto", subElementCode, unit: "unidad", thresholds: T(20, 40), source: "WABIM" },
  ];
}

// Se agregan al catálogo principal:
PATHOLOGY_TYPES.push(
  ...concretePathologies("WING_WALLS", "ALE"),
  ...concretePathologies("ABUTMENTS", "EST"),
  ...concretePathologies("PIERS", "PIL"),
  ...concretePathologies("SLAB", "LOS"),
  ...concretePathologies("CONCRETE_BEAMS", "VIG"),
  ...concretePathologies("STRUTS_DIAPHRAGMS_CONCRETE", "RIO"),
  ...concretePathologies("CONCRETE_ARCHES", "ARC"),

  ...steelPathologies("STEEL_ARCHES__ARCH", "ARCM"),
  ...steelPathologies("STEEL_ARCHES__LATERAL_BRACING", "ARCB"),
  ...steelPathologies("STEEL_PROFILES__BEAMS", "PRB"),
  ...steelPathologies("STEEL_PROFILES__STRINGER", "PRS"),
  ...steelPathologies("STEEL_PROFILES__DIAPHRAGMS", "PRD"),
  ...steelPathologies("STEEL_TRUSSES__CORDS", "TRC"),
  ...steelPathologies("STEEL_TRUSSES__UPRIGHTS", "TRU"),
  ...steelPathologies("STEEL_TRUSSES__DIAGONALS", "TRD"),
);

export const WABIM_CATALOG: WabimCatalog = {
  subCategories: SUB_CATEGORIES,
  elements: ELEMENTS,
  subElements: SUB_ELEMENTS,
  pathologyTypes: PATHOLOGY_TYPES,
};

// ---------------------------------------------------------------------------
// Índices de acceso rápido (usados por el motor de cálculo y el servidor)
// ---------------------------------------------------------------------------
export const subCategoryByCode = new Map(SUB_CATEGORIES.map((s) => [s.code, s]));
export const elementByCode = new Map(ELEMENTS.map((e) => [e.code, e]));
export const subElementByCode = new Map(SUB_ELEMENTS.map((se) => [se.code, se]));
export const pathologyByCode = new Map(PATHOLOGY_TYPES.map((p) => [p.code, p]));

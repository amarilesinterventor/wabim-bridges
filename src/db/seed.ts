/**
 * Script de semilla (seed): carga el catálogo WABIM/INVÍAS y datos de
 * ejemplo (un usuario administrador, dos puentes y una inspección con
 * patologías registradas) para poder probar la aplicación de inmediato.
 *
 * Uso:  npm run seed
 */
import { scryptSync, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { db, newId, transaction } from "./db.js";
import { WABIM_CATALOG } from "../wabim/catalog.js";
import { runWabimCalculation } from "../wabim/engine.js";
import type { WabimInspectionInput } from "../wabim/types.js";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function seedCatalog() {
  const insertSub = db.prepare(
    `INSERT OR REPLACE INTO wabim_subcategories (code, name, cec, source) VALUES (?, ?, ?, ?)`,
  );
  for (const s of WABIM_CATALOG.subCategories) insertSub.run(s.code, s.name, s.cec, s.source);

  const insertEl = db.prepare(
    `INSERT OR REPLACE INTO wabim_elements (code, name, subcategory_code, ec, source, invias_ref) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const e of WABIM_CATALOG.elements)
    insertEl.run(e.code, e.name, e.subCategory, e.ec, e.source, e.invias ?? null);

  const insertSe = db.prepare(
    `INSERT OR REPLACE INTO wabim_subelements (code, name, element_code, ic, unit, source, invias_ref) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const se of WABIM_CATALOG.subElements)
    insertSe.run(se.code, se.name, se.elementCode, se.ic, se.unit, se.source, se.invias ?? null);

  const insertPa = db.prepare(
    `INSERT OR REPLACE INTO wabim_pathology_types (code, name, subelement_code, unit, low_max, high_min, source, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const p of WABIM_CATALOG.pathologyTypes)
    insertPa.run(p.code, p.name, p.subElementCode, p.unit, p.thresholds.lowMax, p.thresholds.highMin, p.source, p.note ?? null);

  console.log(
    `Catálogo cargado: ${WABIM_CATALOG.subCategories.length} subcategorías, ${WABIM_CATALOG.elements.length} elementos, ${WABIM_CATALOG.subElements.length} sub-elementos, ${WABIM_CATALOG.pathologyTypes.length} tipos de patología.`,
  );
}

function seedUsers() {
  const insertUser = db.prepare(
    `INSERT OR REPLACE INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
  );
  const users = [
    { name: "Administrador", email: "admin@wabim.local", password: "admin123", role: "ADMIN" },
    { name: "Inspector Demo", email: "inspector@wabim.local", password: "inspector123", role: "INSPECTOR" },
    { name: "Coordinador Demo", email: "coordinador@wabim.local", password: "coordinador123", role: "COORDINATOR" },
  ];
  const ids: Record<string, string> = {};
  for (const u of users) {
    const id = newId();
    ids[u.email] = id;
    insertUser.run(id, u.name, u.email, hashPassword(u.password), u.role);
  }
  console.log(`Usuarios de ejemplo creados (contraseñas: admin123 / inspector123 / coordinador123).`);
  return ids;
}

function seedBridges() {
  const insertBridge = db.prepare(`
    INSERT OR REPLACE INTO bridges (
      id, code, name, municipality, department, latitude, longitude, route, route_code, concession, km, skew,
      structural_type_transverse, structural_type_longitudinal, number_of_spans,
      length, width, gauge, material, construction_year, owner, entity, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const bridge1Id = newId();
  insertBridge.run(
    bridge1Id,
    "PTE-001",
    "Puente La Esneda (referencia artículo WABIM)",
    "Pereira",
    "Risaralda",
    4.491659,
    -75.41528,
    "Calle 24",
    "01RIS02",
    0,
    0,
    5,
    "Armadura de paso inferior",
    "Vigas simplemente apoyadas",
    1,
    42,
    4.8,
    5.3,
    "Estructura de acero con losa en concreto",
    1970,
    "Municipio de Pereira",
    "INVÍAS",
    "Puente referenciado como caso de aplicación práctica en el artículo científico WABIM (Amariles-López & Osorio-Gómez, 2023). Los datos de inspección cargados aquí son ILUSTRATIVOS (no son las mediciones originales del artículo, que no se publicaron en detalle); sirven para demostrar el flujo completo de captura y cálculo.",
  );

  const bridge2Id = newId();
  insertBridge.run(
    bridge2Id,
    "PTE-002",
    "Puente Quebrada Los Alpes",
    "Dosquebradas",
    "Risaralda",
    4.8339,
    -75.6689,
    "Vía Cauca",
    "66RIS01",
    1,
    12.4,
    0,
    "Losa sobre vigas",
    "Vigas continuas",
    3,
    58,
    9.2,
    5.5,
    "Concreto reforzado",
    1995,
    "Gobernación de Risaralda",
    "INVÍAS",
    "Puente de ejemplo sin inspecciones registradas todavía (para probar el flujo de programación desde cero).",
  );

  console.log(`Puentes de ejemplo creados: PTE-001, PTE-002.`);
  return { bridge1Id, bridge2Id };
}

function seedInspection(bridgeId: string, inspectorId: string) {
  const inspectionId = newId();
  db.prepare(
    `INSERT INTO inspections (id, bridge_id, scheduled_date, executed_date, time, weather, equipment, status, priority, notes, inspector_id, responsible_name, responsible_id_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', 'MEDIUM', ?, ?, ?, ?)`,
  ).run(
    inspectionId,
    bridgeId,
    "2026-06-01",
    "2026-06-03",
    "09:30",
    "Soleado",
    "Cámara digital, fisurómetro de bolsillo, flexómetro, binóculos",
    "Inspección visual general de rutina. Datos ilustrativos con fines de demostración del sistema.",
    inspectorId,
    "Inspector Demo",
    "1088300160",
  );

  // Estructura de entrada para el motor WABIM (ver src/wabim/types.ts)
  const input: WabimInspectionInput = {
    inspectionId,
    elements: [
      {
        id: newId(),
        elementCode: "EXPANSION_JOINTS",
        label: "Juntas de expansión",
        subElements: [
          {
            id: newId(),
            subElementCode: "EXPANSION_JOINTS__SEALANT",
            pathologies: [{ id: newId(), pathologyCode: "AUS", measuredValue: 1.5, totalMeasure: 12.6, description: "Ausencia del sello en junta de entrada", location: "Entrada" }], // 2 juntas x 6.3 m
          },
        ],
      },
      {
        id: newId(),
        elementCode: "RAILINGS",
        label: "Barandas",
        subElements: [
          {
            id: newId(),
            subElementCode: "RAILINGS__PAINT",
            pathologies: [{ id: newId(), pathologyCode: "DE", measuredValue: 30, totalMeasure: 84, description: "Delaminación de pintura en tramos expuestos" }],
          },
          {
            id: newId(),
            subElementCode: "RAILINGS__RAILING",
            pathologies: [{ id: newId(), pathologyCode: "COP", measuredValue: 25, totalMeasure: 84, description: "Corrosión leve a media en pasamanos" }],
          },
        ],
      },
      {
        id: newId(),
        elementCode: "ABUTMENTS",
        label: "Estribo 1 (izquierdo)",
        subElements: [
          {
            id: newId(),
            subElementCode: "ABUTMENTS__OPERATION",
            pathologies: [
              { id: newId(), pathologyCode: "EST_EF", measuredValue: 18, totalMeasure: 45, description: "Eflorescencias por vegetación en el cuerpo del estribo" },
              { id: newId(), pathologyCode: "EST_CTC", measuredValue: 6, totalMeasure: 45, description: "Contaminación biológica del concreto" },
            ],
          },
        ],
      },
      {
        id: newId(),
        elementCode: "PIERS",
        label: "Pila 1",
        subElements: [
          {
            id: newId(),
            subElementCode: "PIERS__OPERATION",
            pathologies: [{ id: newId(), pathologyCode: "PIL_SOC", measuredValue: 3, totalMeasure: 20, description: "Socavación incipiente en la base" }],
          },
        ],
      },
      {
        id: newId(),
        elementCode: "SLAB",
        label: "Losa",
        subElements: [
          {
            id: newId(),
            subElementCode: "SLAB__OPERATION",
            pathologies: [{ id: newId(), pathologyCode: "LOS_EF", measuredValue: 10, totalMeasure: 200, description: "Eflorescencias en zonas puntuales de la losa" }],
          },
        ],
      },
      {
        id: newId(),
        elementCode: "STEEL_TRUSSES",
        label: "Armadura tipo Warren",
        subElements: [
          {
            id: newId(),
            subElementCode: "STEEL_TRUSSES__DIAGONALS",
            pathologies: [{ id: newId(), pathologyCode: "TRD_COM", measuredValue: 3, totalMeasure: 16, description: "Corrosión media en diagonales inferiores" }], // 16 diagonales
          },
          {
            id: newId(),
            subElementCode: "STEEL_TRUSSES__CORDS",
            pathologies: [{ id: newId(), pathologyCode: "TRC_COL", measuredValue: 1, totalMeasure: 4, description: "Corrosión leve en cordón inferior" }],
          },
        ],
      },
    ],
  };

  const result = runWabimCalculation(input);
  return { inspectionId, input, result };
}

function persistInspectionInput(
  input: WabimInspectionInput,
  result: ReturnType<typeof runWabimCalculation>,
) {
  const insertElement = db.prepare(
    `INSERT INTO inspection_elements (id, inspection_id, element_code, label) VALUES (?, ?, ?, ?)`,
  );
  const insertSubElement = db.prepare(
    `INSERT INTO inspection_subelements (id, inspection_element_id, subelement_code, ic_used, label) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertPathology = db.prepare(`
    INSERT INTO pathology_records (
      id, inspection_subelement_id, pathology_code, measured_value, total_measure, description, location,
      density_pct, dc_used, ic_used, wap, low_max_used, high_min_used, calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  for (const elInput of input.elements) {
    insertElement.run(elInput.id, input.inspectionId, elInput.elementCode, elInput.label ?? null);
    for (const seInput of elInput.subElements) {
      const seDef = result.subCategories
        .flatMap((sc) => sc.elements)
        .find((e) => e.elementInstanceId === elInput.id)
        ?.subElements.find((se) => se.subElementInstanceId === seInput.id);
      insertSubElement.run(
        seInput.id,
        elInput.id,
        seInput.subElementCode,
        seDef?.ic ?? 0,
        seInput.label ?? null,
      );
      for (const paInput of seInput.pathologies) {
        const paResult = seDef?.pathologies.find((p) => p.pathologyRecordId === paInput.id);
        insertPathology.run(
          paInput.id,
          seInput.id,
          paInput.pathologyCode,
          paInput.measuredValue,
          paInput.totalMeasure,
          paInput.description ?? null,
          paInput.location ?? null,
          paResult?.densityPct ?? null,
          paResult?.dc ?? null,
          paResult?.ic ?? null,
          paResult?.wap ?? null,
          paResult?.thresholdsUsed.lowMax ?? null,
          paResult?.thresholdsUsed.highMin ?? null,
          result.calculatedAt,
        );
      }
    }
  }

  for (const sc of result.subCategories) {
    for (const el of sc.elements) {
      insertElementResult.run(newId(), el.elementInstanceId, el.ec, el.dae, el.sumWap, el.sumDcIc, el.hasData ? 1 : 0);
    }
    insertSubCategoryResult.run(
      newId(),
      input.inspectionId,
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
    input.inspectionId,
    result.dta,
    result.sumDascCec,
    result.sumCec,
    result.classification.condition,
    result.classification.recommendation,
  );
}

export function main() {
  transaction(() => {
    seedCatalog();
    const users = seedUsers();
    const { bridge1Id } = seedBridges();
    const { inspectionId, input, result } = seedInspection(bridge1Id, users["inspector@wabim.local"]);
    persistInspectionInput(input, result);
    console.log(`Inspección de ejemplo creada (${inspectionId}) — DTA% calculado = ${result.dta.toFixed(2)}% (${result.classification.label}).`);
  });
  console.log("\nSemilla completada con éxito.");
}

// Solo se auto-ejecuta cuando el archivo se corre directamente (`npm run seed`),
// no cuando otro módulo lo importa (p.ej. server.ts para la auto-siembra en
// hosting sin disco persistente, ver runSeedIfEmpty en ese archivo).
const isRunDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) {
  main();
}

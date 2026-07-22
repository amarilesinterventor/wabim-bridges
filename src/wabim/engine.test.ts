/**
 * Pruebas unitarias del motor de cálculo WABIM.
 * Ejecutar con:  node --experimental-strip-types --test src/wabim/engine.test.ts
 * (o `npm test`, ver package.json)
 *
 * Incluye una prueba de verificación contra el caso de aplicación publicado
 * en el artículo (Puente La Esneda, Pereira — DTA% = 16.88%), que sirve como
 * prueba de regresión de la Ecuación 5 y de los coeficientes C.E.C. (Tabla 3).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calcDamageDensity,
  resolveDensityCoefficient,
  calcWap,
  calculateElement,
  calculateSubCategory,
  calculateTotalAffectation,
  classifyCondition,
  runWabimCalculation,
} from "./engine.js";
import type {
  ElementInstanceInput,
  SubCategoryResult,
  WabimInspectionInput,
} from "./types.js";

describe("Ecuación 1 — Densidad de daño", () => {
  test("calcula el porcentaje correctamente", () => {
    assert.equal(calcDamageDensity(2, 8), 25);
    assert.equal(calcDamageDensity(0, 10), 0);
  });

  test("rechaza dimensión total <= 0", () => {
    assert.throws(() => calcDamageDensity(1, 0));
    assert.throws(() => calcDamageDensity(1, -5));
  });

  test("rechaza medida negativa", () => {
    assert.throws(() => calcDamageDensity(-1, 10));
  });
});

describe("Resolución del Coeficiente de Densidad (D.C.) — Tabla 6 [WABIM]", () => {
  const thresholds = { lowMax: 15, highMin: 30 }; // p.ej. "Corner guard"
  test("Bajo cuando density <= lowMax", () => {
    assert.deepEqual(resolveDensityCoefficient(15, thresholds), { severity: "Bajo", dc: 1 });
    assert.deepEqual(resolveDensityCoefficient(0, thresholds), { severity: "Bajo", dc: 1 });
  });
  test("Medio cuando lowMax < density < highMin", () => {
    assert.deepEqual(resolveDensityCoefficient(20, thresholds), { severity: "Medio", dc: 2 });
  });
  test("Alto cuando density >= highMin", () => {
    assert.deepEqual(resolveDensityCoefficient(30, thresholds), { severity: "Alto", dc: 3 });
    assert.deepEqual(resolveDensityCoefficient(99, thresholds), { severity: "Alto", dc: 3 });
  });
});

describe("Ecuación 2 — Promedio Ponderado de la Patología (W.A.P.)", () => {
  test("WAP = densidad x D.C. x I.C.", () => {
    assert.equal(calcWap(25, 2, 4), 200);
  });
});

describe("Ecuación 3 — Grado de Afectación del Elemento (D.A.E.%)", () => {
  test("agrega correctamente varias patologías de un mismo elemento (Juntas de expansión)", () => {
    // Sello (I.C.=4): patología OB con densidad 10% -> Medio (rango 5/25) -> D.C.=2 -> WAP=10*2*4=80
    // Perfil (I.C.=2): patología PD con densidad 10% -> Alto (rango 3/7) -> D.C.=3 -> WAP=10*3*2=60
    const instance: ElementInstanceInput = {
      id: "el-1",
      elementCode: "EXPANSION_JOINTS",
      subElements: [
        {
          id: "se-1",
          subElementCode: "EXPANSION_JOINTS__SEALANT",
          pathologies: [{ id: "p-1", pathologyCode: "OB", measuredValue: 1, totalMeasure: 10 }], // densidad = 10%
        },
        {
          id: "se-2",
          subElementCode: "EXPANSION_JOINTS__PROFILE",
          pathologies: [{ id: "p-2", pathologyCode: "PD", measuredValue: 1, totalMeasure: 10 }], // densidad = 10%
        },
      ],
    };
    const result = calculateElement(instance);
    // sumWap = 80 + 60 = 140 ; sumDcIc = (2*4)+(3*2) = 8+6=14 ; DAE = 140/14 = 10
    assert.equal(result.sumWap, 140);
    assert.equal(result.sumDcIc, 14);
    assert.equal(result.dae, 10);
    assert.equal(result.hasData, true);
  });

  test("un elemento sin patologías registradas no aporta datos (hasData=false, DAE=0)", () => {
    const instance: ElementInstanceInput = {
      id: "el-2",
      elementCode: "RAILINGS",
      subElements: [],
    };
    const result = calculateElement(instance);
    assert.equal(result.hasData, false);
    assert.equal(result.dae, 0);
  });
});

describe("Ecuación 4 — Grado de Afectación de la Subcategoría (D.A.S.C.%)", () => {
  test("promedia por E.C. solo los elementos inspeccionados", () => {
    const elements = [
      calculateElement({
        id: "el-1",
        elementCode: "EXPANSION_JOINTS", // E.C.=3
        subElements: [
          {
            id: "se-1",
            subElementCode: "EXPANSION_JOINTS__SEALANT",
            pathologies: [{ id: "p-1", pathologyCode: "OB", measuredValue: 1, totalMeasure: 10 }],
          },
        ],
      }),
      calculateElement({ id: "el-2", elementCode: "DRAINAGE", subElements: [] }), // sin datos -> excluido
    ];
    const result: SubCategoryResult = calculateSubCategory("SURFACE_EQUIPMENT", elements);
    assert.equal(result.hasData, true);
    // Solo el primer elemento aporta (E.C.=3); DASC = DAE*3/3 = DAE
    assert.equal(result.sumEc, 3);
    assert.ok(Math.abs(result.dasc - elements[0].dae) < 1e-9);
  });
});

describe("Tabla 4 [WABIM] — Clasificación de condición", () => {
  test("rangos límite", () => {
    assert.equal(classifyCondition(0).condition, "SIN_DETERIORO");
    assert.equal(classifyCondition(10).condition, "SIN_DETERIORO");
    assert.equal(classifyCondition(10.1).condition, "DETERIORO_BAJO");
    assert.equal(classifyCondition(40).condition, "DETERIORO_BAJO");
    assert.equal(classifyCondition(40.1).condition, "DETERIORO_MODERADO");
    assert.equal(classifyCondition(50).condition, "DETERIORO_MODERADO");
    assert.equal(classifyCondition(50.1).condition, "DETERIORO_MEDIO_ALTO");
    assert.equal(classifyCondition(90).condition, "DETERIORO_MEDIO_ALTO");
    assert.equal(classifyCondition(90.1).condition, "DETERIORO_ALTO");
    assert.equal(classifyCondition(100).condition, "DETERIORO_ALTO");
  });
});

describe("Verificación contra el caso de aplicación publicado — Puente La Esneda (Pereira)", () => {
  test("Ecuación 5 reproduce DTA% = 16.88% a partir de los DASC% y C.E.C. publicados", () => {
    // Valores de DASC% publicados en la Figura 4 del artículo [WABIM]:
    //   Surface and equipment = 31.55 %  (C.E.C.=2)
    //   Substructure           = 21.21 %  (C.E.C.=5)   [el artículo lo llama "Concrete Substructure"]
    //   Concrete Superstructure= 4.98  %  (C.E.C.=5)
    //   Steel Superstructure   = 18.57 %  (C.E.C.=5)
    // Resultado publicado (Tabla 7): DTA% = 16.88 %
    const fakeSubCategories: SubCategoryResult[] = [
      { subCategory: "SURFACE_EQUIPMENT", subCategoryName: "x", cec: 2, elements: [], dasc: 31.55, sumDaeEc: 0, sumEc: 0, hasData: true },
      { subCategory: "SUBSTRUCTURE", subCategoryName: "x", cec: 5, elements: [], dasc: 21.21, sumDaeEc: 0, sumEc: 0, hasData: true },
      { subCategory: "CONCRETE_SUPERSTRUCTURE", subCategoryName: "x", cec: 5, elements: [], dasc: 4.98, sumDaeEc: 0, sumEc: 0, hasData: true },
      { subCategory: "STEEL_SUPERSTRUCTURE", subCategoryName: "x", cec: 5, elements: [], dasc: 18.57, sumDaeEc: 0, sumEc: 0, hasData: true },
    ];
    const { dta } = calculateTotalAffectation(fakeSubCategories);
    assert.ok(Math.abs(dta - 16.88) < 0.01, `DTA calculado (${dta.toFixed(4)}) debe ser ≈ 16.88`);
    assert.equal(classifyCondition(dta).condition, "DETERIORO_BAJO");
  });
});

describe("Orquestador runWabimCalculation — extremo a extremo", () => {
  test("produce un resultado consistente para una inspección mínima", () => {
    const input: WabimInspectionInput = {
      inspectionId: "insp-test-1",
      elements: [
        {
          id: "el-1",
          elementCode: "EXPANSION_JOINTS",
          subElements: [
            {
              id: "se-1",
              subElementCode: "EXPANSION_JOINTS__SEALANT",
              pathologies: [{ id: "p-1", pathologyCode: "AUS", measuredValue: 2, totalMeasure: 20 }], // densidad=10% -> Medio
            },
          ],
        },
        {
          id: "el-2",
          elementCode: "PIERS",
          subElements: [
            {
              id: "se-2",
              subElementCode: "PIERS__OPERATION",
              pathologies: [{ id: "p-2", pathologyCode: "PIL_SOC", measuredValue: 3, totalMeasure: 4 }], // densidad=75% -> Alto
            },
          ],
        },
      ],
    };
    const result = runWabimCalculation(input);
    assert.equal(result.steps.length, 12);
    assert.ok(result.dta > 0 && result.dta <= 100);
    const surface = result.subCategories.find((s) => s.subCategory === "SURFACE_EQUIPMENT")!;
    const substructure = result.subCategories.find((s) => s.subCategory === "SUBSTRUCTURE")!;
    assert.equal(surface.hasData, true);
    assert.equal(substructure.hasData, true);
    const concreteSuper = result.subCategories.find((s) => s.subCategory === "CONCRETE_SUPERSTRUCTURE")!;
    const steelSuper = result.subCategories.find((s) => s.subCategory === "STEEL_SUPERSTRUCTURE")!;
    assert.equal(concreteSuper.hasData, false);
    assert.equal(steelSuper.hasData, false);
  });
});

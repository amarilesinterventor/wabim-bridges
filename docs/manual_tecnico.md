# Manual Técnico — WABIM Bridges

## 1. Arquitectura

```
┌─────────────────────┐      HTTP/JSON       ┌──────────────────────────┐
│  Frontend (public/)  │  ───────────────►    │  Servidor (src/server)   │
│  HTML/JS vanilla +   │  ◄───────────────    │  Node http nativo        │
│  Tailwind CDN        │                      │  Rutas /api/*            │
└─────────────────────┘                      └────────────┬─────────────┘
                                                            │
                                              ┌─────────────▼─────────────┐
                                              │  src/server/wabimService.ts │
                                              │  (glue capa BD ↔ motor)     │
                                              └─────────────┬─────────────┘
                              lee catálogo/coeficientes     │  invoca con
                              vigentes desde BD             │  WabimLookups
                                                            ▼
┌────────────────────────────┐              ┌──────────────────────────┐
│  src/db (SQLite nativo)     │◄────────────►│  src/wabim (motor puro)  │
│  schema.sql, db.ts,         │              │  types.ts, catalog.ts,   │
│  queries.ts, seed.ts        │              │  engine.ts               │
└────────────────────────────┘              └──────────────────────────┘
        ▲
        │  espejo funcional de
        │
┌────────────────────────────┐
│  prisma/schema.prisma       │  ← modelo de datos objetivo (PostgreSQL)
│  sql/postgresql_schema.sql  │
└────────────────────────────┘
```

El principio de diseño central es que **`src/wabim` no importa nada de
`src/db` ni de `src/server`**. Es una librería de cálculo pura: recibe
estructuras de datos en memoria (`WabimInspectionInput`) y devuelve
estructuras de datos en memoria (`WabimResult`) con trazabilidad completa.
Esto permite:

- Probarla con `node:test` sin levantar servidor ni base de datos.
- Reemplazar SQLite por PostgreSQL/Prisma sin tocar una sola línea de
  `src/wabim`.
- Reemplazar el servidor HTTP nativo por Next.js API routes o controllers de
  NestJS sin tocar `src/wabim`.

## 2. La metodología WABIM — desarrollo matemático completo

Fuente: Amariles-López & Osorio-Gómez (2023), *Weighted Average Bridge
Inspection Methodology (WABIM)*, Revista DYNA 90(225).

El cálculo procede en 4 etapas (Fig. 1 del artículo): **Sub-elementos →
Elementos → Subcategorías → Puente total**.

### 2.1 Densidad de daño (Ecuación 1)

Para cada patología detectada en un sub-elemento:

```
Densidad de daño (%) = (medida del daño / medida total del sub-elemento) × 100
```

Implementado en `calcDamageDensity()` (`src/wabim/engine.ts`). La "medida
total del sub-elemento" es la dimensión completa de ese sub-elemento en el
puente (p.ej. longitud total del sello de una junta), no la del daño.

### 2.2 Coeficiente de Densidad — D.C. (rangos de severidad, Tabla 6)

Cada tipo de patología tiene un rango propio de severidad (Bajo/Medio/Alto),
definido en `Table 6` del artículo (p.ej. Sello de junta: Bajo &lt;5%,
Medio 5-25%, Alto &gt;25%). Se traduce a D.C. = 1, 2 o 3 respectivamente.
Implementado en `resolveDensityCoefficient()`, con semántica idéntica a la
hoja de cálculo Excel de referencia (límite inferior inclusivo hacia abajo,
límite superior inclusivo hacia arriba).

### 2.3 Coeficiente de Importancia — I.C. (Tabla 1)

Cada **sub-elemento** (no cada patología) tiene un I.C. fijo de 1 a 5, según
su importancia relativa dentro del elemento (p.ej. dentro de "Juntas de
expansión": Sello=4, Perfil=2, Guardacanto=2).

### 2.4 Promedio Ponderado de la Patología — W.A.P. (Ecuación 2)

```
WAP = Densidad de daño × D.C. × I.C.
```

### 2.5 Grado de Afectación del Elemento — D.A.E.% (Ecuación 3)

```
DAE% = Σ WAP (de todas las patologías del elemento) / Σ (D.C.ᵢ × I.C.ᵢ)
```

Solo se suman las patologías **efectivamente registradas** — si un
sub-elemento se inspeccionó y no se encontró daño, se registra igualmente
con `measuredValue = 0` (aporta D.C.=1 al denominador, WAP=0 al numerador,
empujando el promedio hacia condición sana). Si un sub-elemento **no se
inspeccionó en absoluto**, simplemente no se crea el registro y no participa
en la sumatoria — igual que en la hoja de cálculo Excel de referencia.

### 2.6 Grado de Afectación de la Subcategoría — D.A.S.C.% (Ecuación 4)

```
DASC% = Σ (DAEᵢ × E.C.ᵢ) / Σ E.C.ᵢ
```

Con el Coeficiente de Elemento (E.C., Tabla 2) de cada elemento. Solo se
incluyen elementos con al menos una patología registrada.

### 2.7 Grado de Afectación Total del puente — D.T.A.% (Ecuación 5)

```
DTA% = Σ (DASCᵢ × C.E.C.ᵢ) / Σ C.E.C.ᵢ
```

Con el Coeficiente de Elemento Categórico (C.E.C., Tabla 3) de cada una de
las 4 subcategorías (Superficie y equipamiento=2, Subestructura=5,
Superestructura en concreto=5, Superestructura metálica=5).

### 2.8 Clasificación de la condición (Tabla 4)

| DTA%          | Condición                | Recomendación                                  |
|---------------|--------------------------|-------------------------------------------------|
| 0% – 10%      | Sin deterioro            | Mantenimiento preventivo a largo plazo          |
| 10.1% – 40%   | Deterioro bajo           | Mantenimiento preventivo a mediano plazo        |
| 40.1% – 50%   | Deterioro moderado       | Mantenimiento correctivo/preventivo a corto plazo|
| 50.1% – 90%   | Deterioro medio-alto     | Intervención inmediata                          |
| 90.1% – 100%  | Deterioro alto           | Cierre inmediato de la estructura               |

### 2.9 Verificación contra el caso publicado

El artículo presenta un caso de aplicación real (Puente La Esneda, Pereira)
con resultados por subcategoría: Superficie y equipamiento=31.55%,
Subestructura=21.21%, Superestructura en concreto=4.98%, Superestructura
metálica=18.57%, con **DTA% = 16.88%** publicado.

`src/wabim/engine.test.ts` reproduce este cálculo exacto (Ecuación 5) y
confirma que el motor produce 16.88% ± 0.01 a partir de esos valores y de
los C.E.C. de la Tabla 3 — es la prueba de regresión más importante del
proyecto, porque valida independientemente tanto la fórmula como los
coeficientes C.E.C. contra un resultado publicado y revisado por pares.

## 3. Trazabilidad del catálogo (WABIM vs. INVÍAS vs. extensión)

El Manual INVÍAS define ~20 elementos y decenas de patologías; el artículo
WABIM solo tabuló coeficientes explícitos para un subconjunto (los que
usó en su caso de estudio). Para poder inspeccionar un puente completo
según el Manual INVÍAS sin perder ninguna patología, el catálogo
(`src/wabim/catalog.ts`) marca cada entrada con su origen:

- **`WABIM`**: coeficiente o rango tomado literalmente de las Tablas 1, 2, 3
  o 6 del artículo.
- **`INVIAS`**: la patología está descrita en el Manual INVÍAS pero el
  artículo no le asignó fila propia en la Tabla 6; se reutiliza el rango
  del grupo más afín **del propio artículo** (se documenta cuál en el campo
  `note` de cada patología).
- **`EXTENSION`**: ni el artículo ni el Manual definen un valor numérico
  explícito (p.ej. "Cauce", "Acceso peatonal", "Apoyos" como sub-elemento);
  se propone un valor por defecto razonable, marcado para que un ingeniero
  estructural lo audite/calibre antes de usarlo en producción.

Esta distinción se muestra en la UI (`/admin.html`, columna "Origen") y se
puede consultar programáticamente vía `GET /api/catalog` (campo `source` en
cada entidad).

## 4. Referencia de la API HTTP (servidor de demostración)

| Método | Ruta                                              | Auth        | Descripción |
|--------|----------------------------------------------------|-------------|-------------|
| POST   | `/api/auth/login`                                  | —           | `{email, password}` → `{token, user}` |
| GET    | `/api/me`                                          | Bearer      | Usuario autenticado |
| GET    | `/api/users`                                       | Bearer      | Lista de usuarios |
| GET    | `/api/catalog`                                     | —           | Catálogo completo (subcategorías/elementos/sub-elementos/patologías) |
| PUT    | `/api/catalog/subcategories/:code`                 | Admin       | `{cec}` |
| PUT    | `/api/catalog/elements/:code`                      | Admin       | `{ec}` |
| PUT    | `/api/catalog/subelements/:code`                   | Admin       | `{ic}` |
| PUT    | `/api/catalog/pathologies/:code`                   | Admin       | `{lowMax, highMin}` |
| GET    | `/api/bridges`                                     | —           | Lista de puentes |
| POST   | `/api/bridges`                                     | —           | Crea un puente |
| GET    | `/api/bridges/:id`                                 | —           | Detalle + documentos + inspecciones |
| POST   | `/api/bridges/:id/inspections`                     | —           | Programa una inspección |
| GET    | `/api/inspections/:id`                             | —           | Detalle completo (elementos/sub-elementos/patologías/resultados) |
| POST   | `/api/inspections/:id/elements`                    | —           | `{elementCode, label}` |
| DELETE | `/api/inspection-elements/:id`                     | —           | Elimina un elemento y su contenido |
| POST   | `/api/inspection-elements/:id/subelements`         | —           | `{subElementCode, totalMeasure, label}` |
| DELETE | `/api/inspection-subelements/:id`                  | —           | Elimina un sub-elemento y sus patologías |
| POST   | `/api/inspection-subelements/:id/pathologies`      | —           | `{pathologyCode, measuredValue, description, location, ...}` |
| DELETE | `/api/pathology-records/:id`                       | —           | Elimina un registro de patología |
| POST   | `/api/inspections/:id/calculate`                   | —           | Ejecuta el motor WABIM y persiste el resultado con trazabilidad |

> Nota de seguridad: en esta demostración solo los endpoints de catálogo
> exigen rol `ADMIN`; el resto solo requiere que exista *algún* token válido
> o, en varios casos, ni siquiera eso. **Esto es intencional para simplificar
> las pruebas** y debe endurecerse (autorización por rol en cada ruta,
> verificación de pertenencia del recurso, rate limiting, CSRF, etc.) antes
> de un despliegue real — ver Roadmap en `README.md`.

## 5. Cómo se preservan los coeficientes históricos (auditoría)

Cuando `POST /api/inspections/:id/calculate` corre:

1. Lee el catálogo **vigente** desde la base de datos (`wabimService.ts →
   buildLookupsFromDb()`), reflejando cualquier edición reciente del
   administrador.
2. Ejecuta `runWabimCalculation()` (motor puro).
3. Guarda ("congela") en cada `pathology_records` el `density_pct`,
   `dc_used`, `ic_used`, `wap`, `low_max_used`, `high_min_used` **usados en
   ese cálculo concreto** — no una referencia al catálogo actual.
4. Igual para `element_results` (`ec_used`, `dae`) y `subcategory_results`
   (`cec_used`, `dasc`).

Esto significa que si el administrador cambia un E.C. de 3 a 5 la semana
próxima, todas las inspecciones ya calculadas **conservan** su D.A.E.
original — solo los cálculos nuevos usan el 5. Esto es indispensable para
la auditoría regulatoria (INVÍAS) y para poder comparar inspecciones a
través del tiempo con criterios consistentes en cada momento.

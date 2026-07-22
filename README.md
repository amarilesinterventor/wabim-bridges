# WABIM Bridges

Sistema de evaluación del estado de puentes mediante inspección visual,
implementando íntegramente la **metodología WABIM** (Weighted Average Bridge
Inspection Methodology) y la clasificación de elementos/patologías del
**Manual para la Inspección Visual de Puentes y Pontones de INVÍAS**.

## Alcance de esta entrega

Este proyecto se construyó para la solicitud de un sistema integral tipo BMS
(Bridge Management System). Dado el tamaño de esa solicitud (meses de
desarrollo de un producto completo), se acordó explícitamente con el usuario
enfocar esta entrega en las dos piezas más críticas y difíciles de acertar
— porque de estar mal, invalidarían todo lo demás:

1. **El motor de cálculo WABIM** (`src/wabim/engine.ts`) — implementación
   íntegra y verificada de las 5 ecuaciones del artículo científico, sin
   simplificaciones, con trazabilidad matemática completa.
2. **El modelo de datos** (`prisma/schema.prisma` + `sql/postgresql_schema.sql`)
   — el esquema PostgreSQL objetivo para la arquitectura Next.js/NestJS +
   Prisma solicitada.

Además se entrega una **aplicación web funcional de extremo a extremo**
(inventario de puentes → programación → captura de inspección por
elemento/sub-elemento/patología → cálculo WABIM con auditoría completa →
edición de coeficientes) para poder probar el motor y el modelo con datos
reales, no solo leerlos como especificación.

Lo que **no** se construyó todavía (y por qué) está documentado en la
sección [Roadmap](#roadmap--lo-que-falta-para-el-bms-completo).

## Nota sobre el entorno de generación (importante)

El entorno en el que se generó este proyecto **no tuvo acceso a internet**
(no se pudo hacer `npm install` de ningún paquete: ni Next.js, ni NestJS, ni
Prisma, ni PostgreSQL gestionado, ni Tailwind CLI). Por eso:

* El servidor de demostración (`src/server`) es Node.js puro (módulo
  `http` nativo), sin ningún paquete externo — funciona con solo tener
  Node.js instalado, sin `npm install`.
* La base de datos de demostración usa `node:sqlite` (nativo de Node ≥22.5)
  en vez de PostgreSQL — el **esquema relacional es idéntico** en su
  estructura (ver `prisma/schema.prisma` para PostgreSQL).
* El frontend (`public/*.html`) es HTML/JS vanilla con TailwindCSS por CDN,
  en vez de Next.js/React — no requiere paso de build.
* La autenticación usa tokens firmados con HMAC (`node:crypto`) en vez de
  una librería JWT — el formato de los claims es compatible con JWT real.

**Ninguna de estas sustituciones afecta al motor de cálculo ni al modelo de
datos**, que son exactamente lo que se pidió como entregable prioritario.
Con acceso normal a internet (tu máquina, un CI/CD, un servidor), migrar a
la arquitectura completa Next.js/NestJS + PostgreSQL + Prisma es un trabajo
de *reemplazar la capa de infraestructura*, no de rehacer la lógica de
negocio — ver [Cómo migrar a producción](#cómo-migrar-a-producción).

## Cómo ejecutar la demostración

Requiere **Node.js 22.5 o superior** (por `node:sqlite`) y PostgreSQL **no**
es necesario para esta demo.

```bash
npm install        # instala typescript/tsx (herramientas de desarrollo)
npm run seed       # crea data/wabim.sqlite, carga el catálogo y datos de ejemplo
npm run dev        # inicia el servidor en http://localhost:4000
```

Abre `http://localhost:4000` e inicia sesión con una de las cuentas de
ejemplo (creadas por `npm run seed`):

| Correo                     | Contraseña      | Rol          |
|----------------------------|-----------------|--------------|
| admin@wabim.local          | admin123        | ADMIN        |
| inspector@wabim.local      | inspector123    | INSPECTOR    |
| coordinador@wabim.local    | coordinador123  | COORDINATOR  |

### Pruebas unitarias del motor de cálculo

```bash
npm test
```

Incluye una prueba de regresión que reproduce el caso de aplicación
publicado en el artículo (Puente La Esneda, Pereira — DTA% = 16.88%) a
partir de los coeficientes C.E.C. de la Tabla 3, además de pruebas de cada
ecuación (1 a 5) y de los rangos de clasificación (Tabla 4).

## Estructura del proyecto

```
src/wabim/           Motor de cálculo WABIM — SIN dependencias de framework/BD
  types.ts             Tipos de dominio
  catalog.ts           Catálogo completo (subcategorías, elementos, sub-elementos,
                        patologías) con coeficientes I.C./E.C./C.E.C. y umbrales D.C.
  engine.ts            Ecuaciones 1-5, clasificación (Tabla 4), orquestador
  engine.test.ts        Pruebas unitarias + verificación contra el caso publicado

prisma/schema.prisma  Modelo de datos objetivo (PostgreSQL + Prisma)
sql/postgresql_schema.sql  DDL PostgreSQL equivalente, legible sin Prisma

src/db/               Capa de persistencia de la DEMO (SQLite nativo)
  schema.sql            Espejo funcional de prisma/schema.prisma en SQLite
  db.ts, queries.ts, seed.ts

src/server/           Servidor HTTP de la demo (Node puro) + autenticación + API
public/               Frontend vanilla (HTML/CSS/JS) de la demo

docs/                 ERD, manual técnico, manual de usuario
```

## Cómo migrar a producción (Next.js/NestJS + PostgreSQL + Prisma)

1. `npm install prisma @prisma/client` en un proyecto Next.js o NestJS.
2. Copiar `prisma/schema.prisma`, configurar `DATABASE_URL` (PostgreSQL) y
   correr `npx prisma migrate dev`.
3. Traducir `src/db/seed.ts` a un seed de Prisma (es prácticamente un
   copiar/pegar: mismo `WABIM_CATALOG`, mismas llamadas, cambiando SQL crudo
   por `prisma.subCategory.create(...)`, etc.).
4. **Copiar `src/wabim/*.ts` sin ningún cambio** — el motor es puro y no
   conoce ni SQLite ni PostgreSQL ni Node `http`. Los API routes de Next.js
   (o los controllers de NestJS) simplemente llaman a
   `runWabimCalculation(input, lookups)` igual que hace hoy
   `src/server/wabimService.ts`.
5. Reemplazar `src/server/auth.ts` por JWT real (`jsonwebtoken` o
   `@nestjs/jwt`) — la forma de los claims (`sub`, `email`, `role`, `exp`)
   ya es compatible.
6. Reemplazar el frontend vanilla por componentes React/Next.js + shadcn/ui,
   reutilizando las mismas llamadas a `/api/*` (o traduciéndolas a Server
   Actions / React Query).

## Roadmap — lo que falta para el BMS completo

Estos módulos estaban en la solicitud original y **no** se construyeron en
esta entrega (alcance acordado). El modelo de datos ya tiene los puntos de
extensión necesarios (relaciones por `bridge_id` / `inspection_id`) para
añadirlos sin refactorizar el núcleo:

- **Dashboard ejecutivo con gráficas** (radar, barras, pastel, histograma,
  heatmap, treemap, sunburst) e indicadores agregados por municipio/departamento.
- **Mapa GIS interactivo** (Leaflet/Mapbox) con semáforo de estado por puente.
- **Generación de informes PDF/Word/Excel** con portada, fotos, tablas de
  patologías/elementos/índices, QR, firmas.
- **Comparación histórica entre inspecciones** (evolución, empeoramiento/mejoría).
- **Módulo de IA** (resumen técnico, causas probables, recomendaciones) —
  el usuario indicó que, por ahora, este módulo puede ser un motor basado en
  reglas/plantillas sobre los datos WABIM, con la interfaz ya lista para
  conectar un LLM real después.
- **Carga y anotación de fotografías** (flechas, círculos, geolocalización,
  comparación histórica) — el modelo de datos (`Photo.annotations` JSON) ya
  contempla el campo; falta el editor visual.
- **Almacenamiento en la nube** (S3 o equivalente) para fotos/documentos —
  hoy los campos son URLs de texto libre, listas para apuntar a un bucket.
- **PWA / soporte offline** para trabajo de campo sin conectividad.
- **Autorización granular completa** por rol en cada endpoint (hoy solo los
  endpoints de catálogo exigen rol ADMIN; el resto exige solo estar
  autenticado) y CRUD completo de usuarios desde la UI.
- **Exportación Excel/Word** del registro de inspección (reemplazo total de
  la hoja de cálculo original).

## Fuentes

- Amariles-López, C.C. & Osorio-Gómez, C.C. (2023). *Weighted Average Bridge
  Inspection Methodology (WABIM)*. Revista DYNA, 90(225), 55-63.
  https://doi.org/10.15446/dyna.v90n225.104694
- INVÍAS / Universidad Nacional de Colombia (2006). *Manual para la
  Inspección Visual de Puentes y Pontones*. Convenio Interadministrativo 587-03.
- "Herramienta de cuantificación de daño en puentes.xlsx" (archivo de
  referencia proporcionado por el usuario), usada para validar la lógica de
  cálculo celda por celda (hoja "Grado de afectación") y la estructura de
  captura (hojas "Registro de daños", "Datos generales", "Esquema de elementos").

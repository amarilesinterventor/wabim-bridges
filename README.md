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

El entorno en el que se generó la primera versión de este proyecto **no tuvo
acceso a internet** (no se pudo hacer `npm install` de ningún paquete: ni
Next.js, ni NestJS, ni Prisma, ni PostgreSQL gestionado, ni Tailwind CLI). Por
eso:

* El servidor de demostración (`src/server`) es Node.js puro (módulo
  `http` nativo), sin ningún paquete externo — funciona con solo tener
  Node.js instalado, sin `npm install`.
* La base de datos de demostración usa `node:sqlite` (nativo de Node ≥22.5)
  en vez de PostgreSQL — el **esquema relacional es idéntico** en su
  estructura (ver `prisma/schema.prisma` para PostgreSQL).
* El frontend (`public/*.html`) es HTML/JS vanilla con TailwindCSS, en vez de
  Next.js/React. Desde que se tuvo acceso a internet en el entorno de
  desarrollo se dejó de usar el CDN de Tailwind (`cdn.tailwindcss.com`) — que
  en algunas redes/navegadores de los usuarios finales no cargaba y dejaba
  toda la app sin estilos — y se compila localmente con la Tailwind CLI
  (`npm run build:css`, ver `package.json`) a un archivo `public/tailwind.css`
  servido por el propio servidor, sin depender de ningún recurso externo.
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

## Despliegue en la nube (Render, nivel gratis)

El proyecto incluye un [`render.yaml`](render.yaml) listo para desplegar en
[Render](https://render.com) sin configuración adicional:

1. Entra a [render.com](https://render.com) e inicia sesión / crea una cuenta (gratis).
2. "New" → "Blueprint" → conecta este repositorio de GitHub.
3. Render detecta `render.yaml` automáticamente y crea el servicio (plan **Free**).
4. Espera el build (2-3 min) y abre la URL que te asigna (`https://wabim-bridges-xxxx.onrender.com`).

**Importante — nivel gratis sin disco persistente:** el plan Free de Render
no incluye almacenamiento persistente, así que la base de datos SQLite y las
fotos subidas **se reinician** cada vez que el servicio se redespliega o se
reinicia (p.ej. tras dormirse por inactividad). Para que la app siempre
arranque funcional, el servidor detecta si la base de datos está vacía y
recarga automáticamente el catálogo WABIM/INVÍAS y los datos de ejemplo (ver
`autoSeedIfEmpty` en `src/server/server.ts`) — pero cualquier puente,
inspección o foto que hayas agregado tú se perderá en el próximo reinicio.

Para tener persistencia real (que los datos no se borren), hay que pasar a
un plan pago (~USD 7/mes) y agregar un disco — la plantilla comentada al
final de `render.yaml` muestra cómo.

## App Android offline (sin internet, sin servidor)

Además de la app web (arriba), el proyecto incluye una versión empaquetada
como app nativa de Android (`.apk`) que **no necesita conexión ni servidor
en ningún momento** — ni siquiera en la primera instalación. Toda la lógica
que normalmente vive en `src/server` (base de datos, cálculo WABIM, fotos,
informe PDF) corre dentro del propio dispositivo — ver
`public/offline/*.js` para el detalle de la arquitectura.

**Qué funciona igual que la web:** inventario de puentes, inspecciones,
patologías, cálculo WABIM (mismo motor, mismos resultados — verificado byte
a byte contra la versión servidor), fotos (cámara o galería), informe PDF
(mismo diseño), responsable del informe, eliminar puentes.

**Limitación conocida:** la búsqueda en el catálogo oficial INVÍAS
(datos.gov.co, al registrar un puente) necesita internet por definición —
en la app offline simplemente no devuelve resultados, sin romper el
formulario.

### Requisitos para compilar el `.apk`

- Node.js ≥ 22.5 (igual que para la app web).
- JDK 21 y Android SDK (`platform-tools`, `platforms;android-35` o
  superior, `build-tools;35.0.0` o superior) — configura `ANDROID_HOME` y
  `JAVA_HOME`, o abre el proyecto en **Android Studio**, que los gestiona
  automáticamente.
- En Windows, configura `npm` para correr los scripts con Git Bash en vez
  de `cmd.exe` (varios scripts usan sintaxis POSIX porque también deben
  funcionar tal cual en el build de Linux de Render): crea un `.npmrc`
  local (no versionado) con `script-shell=C:\\Program Files\\Git\\bin\\bash.exe`
  (ajusta la ruta si Git está instalado en otro lugar).

### Compilar

```bash
npm install
npm run android:sync    # compila/copia el motor WABIM, sql.js, pdf-lib, etc. a public/ y los sincroniza al proyecto Android
npm run android:build   # corre Gradle y genera el .apk (android/app/build/outputs/apk/debug/app-debug.apk)
```

O, para usar la interfaz gráfica de Android Studio en vez de la línea de
comandos: `npm run android:sync` y luego `npx cap open android`.

El `.apk` generado con `assembleDebug` está firmado con una clave de
depuración (no apta para publicar en Google Play) pero se puede instalar
directamente en cualquier dispositivo Android habilitando "Instalar apps de
orígenes desconocidos" — suficiente para uso interno/piloto de campo. Para
publicarla en Play Store hace falta generar una clave de firma propia y
correr `assembleRelease` en su lugar (ver la
[documentación de Android sobre firma de apps](https://developer.android.com/studio/publish/app-signing)).

### Probar la lógica offline sin compilar el `.apk`

Toda la capa de datos offline (`public/offline/*.js`) también corre en un
navegador de escritorio normal — útil para iterar rápido sin pasar por
Gradle en cada cambio. Con el servidor de desarrollo corriendo
(`npm run dev`), abre `http://localhost:4000/login.html?offline=1`: la app
usa la misma base de datos SQLite en el navegador (vía sql.js/WebAssembly,
persistida en IndexedDB en vez de en el sistema de archivos del teléfono)
en lugar de llamar al servidor.

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
  offline/              Capa de datos de la app Android offline (ver más abajo) —
                        mismo SQL/lógica que src/db + src/server, pero en JS de
                        navegador (sql.js) en vez de node:sqlite
  wabim/, vendor/, db-schema.sql   Generados por "npm run build:offline" (no versionados)

android/              Proyecto nativo generado por Capacitor (app Android offline)
capacitor.config.ts   Configuración de Capacitor (appId, nombre, carpeta web)

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

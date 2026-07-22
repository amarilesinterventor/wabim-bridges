-- =============================================================================
-- WABIM Bridges — Esquema PostgreSQL de referencia (equivalente a prisma/schema.prisma)
-- =============================================================================
-- Este archivo es el DDL PostgreSQL "objetivo" para la arquitectura de
-- producción (Next.js/NestJS + PostgreSQL + Prisma). Se entrega como
-- referencia adicional/legible por cualquier DBA, independiente de Prisma.
-- La forma canónica y mantenible del esquema es prisma/schema.prisma;
-- este archivo puede regenerarse en cualquier momento con:
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- para gen_random_uuid()

-- --- Enums -------------------------------------------------------------------
CREATE TYPE "UserRole" AS ENUM ('ADMIN','COORDINATOR','INSPECTOR','CONSULTANT','CLIENT','READONLY');
CREATE TYPE "InspectionStatus" AS ENUM ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED');
CREATE TYPE "InspectionPriority" AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
CREATE TYPE "CatalogSource" AS ENUM ('WABIM','INVIAS','EXTENSION');
CREATE TYPE "MeasurementUnit" AS ENUM ('ML','M2','UNIDAD','PORCENTAJE','MM');
CREATE TYPE "BridgeCondition" AS ENUM ('SIN_DETERIORO','DETERIORO_BAJO','DETERIORO_MODERADO','DETERIORO_MEDIO_ALTO','DETERIORO_ALTO');
CREATE TYPE "PhotoKind" AS ENUM ('DAMAGE','PANORAMIC');

-- --- Usuarios ------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          "UserRole" NOT NULL DEFAULT 'INSPECTOR',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Inventario de puentes ------------------------------------------------------
CREATE TABLE bridges (
  id                            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code                          TEXT NOT NULL UNIQUE,
  name                          TEXT NOT NULL,
  municipality                  TEXT,
  department                    TEXT,
  latitude                      DOUBLE PRECISION,
  longitude                     DOUBLE PRECISION,
  route                         TEXT,
  route_code                    TEXT,
  concession                    BOOLEAN,
  km                            DOUBLE PRECISION,
  skew                          DOUBLE PRECISION,
  structural_type_transverse    TEXT,
  structural_type_longitudinal  TEXT,
  number_of_spans               INTEGER,
  length                        DOUBLE PRECISION,
  width                         DOUBLE PRECISION,
  gauge                         DOUBLE PRECISION,
  material                      TEXT,
  construction_year             INTEGER,
  owner                         TEXT,
  entity                        TEXT,
  notes                         TEXT,
  main_photo_url                TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bridges_location ON bridges(department, municipality);

CREATE TABLE bridge_documents (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bridge_id  TEXT NOT NULL REFERENCES bridges(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  type       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Inspecciones ----------------------------------------------------------------
CREATE TABLE inspections (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bridge_id      TEXT NOT NULL REFERENCES bridges(id) ON DELETE CASCADE,
  scheduled_date TIMESTAMPTZ,
  executed_date  TIMESTAMPTZ,
  time           TEXT,
  weather        TEXT,
  equipment      TEXT,
  status         "InspectionStatus" NOT NULL DEFAULT 'SCHEDULED',
  priority       "InspectionPriority" NOT NULL DEFAULT 'MEDIUM',
  notes          TEXT,
  inspector_id   TEXT REFERENCES users(id),
  coordinator_id TEXT REFERENCES users(id),
  responsible_name       TEXT,
  responsible_id_number  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inspections_bridge ON inspections(bridge_id);

-- --- Catálogo WABIM / INVÍAS ------------------------------------------------------
CREATE TABLE wabim_subcategories (
  code   TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  cec    DOUBLE PRECISION NOT NULL,
  source "CatalogSource" NOT NULL DEFAULT 'WABIM'
);

CREATE TABLE wabim_elements (
  code             TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  subcategory_code TEXT NOT NULL REFERENCES wabim_subcategories(code),
  ec               DOUBLE PRECISION NOT NULL,
  source           "CatalogSource" NOT NULL DEFAULT 'WABIM',
  invias_ref       TEXT
);

CREATE TABLE wabim_subelements (
  code         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  element_code TEXT NOT NULL REFERENCES wabim_elements(code),
  ic           DOUBLE PRECISION NOT NULL,
  unit         "MeasurementUnit" NOT NULL,
  source       "CatalogSource" NOT NULL DEFAULT 'WABIM',
  invias_ref   TEXT
);

CREATE TABLE wabim_pathology_types (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  subelement_code TEXT NOT NULL REFERENCES wabim_subelements(code),
  unit            "MeasurementUnit" NOT NULL,
  low_max         DOUBLE PRECISION NOT NULL,
  high_min        DOUBLE PRECISION NOT NULL,
  source          "CatalogSource" NOT NULL DEFAULT 'WABIM',
  note            TEXT
);

-- --- Captura de campo ---------------------------------------------------------------
CREATE TABLE inspection_elements (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_id  TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  element_code   TEXT NOT NULL REFERENCES wabim_elements(code),
  label          TEXT,
  dimensions     TEXT,
  quantity       INTEGER,
  material       TEXT,
  condition      TEXT,
  location       TEXT,
  main_photo_url TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_insp_elements_inspection ON inspection_elements(inspection_id);

CREATE TABLE inspection_subelements (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_element_id TEXT NOT NULL REFERENCES inspection_elements(id) ON DELETE CASCADE,
  subelement_code       TEXT NOT NULL REFERENCES wabim_subelements(code),
  ic_used               DOUBLE PRECISION NOT NULL,
  label                 TEXT
);
CREATE INDEX idx_insp_subelements_element ON inspection_subelements(inspection_element_id);

-- `total_measure` vive aquí (no en inspection_subelements): el Anexo C
-- [INVIAS] asigna unidades distintas a patologías de un mismo sub-elemento
-- (p.ej. en "Diseño" de un elemento de concreto, Aplastamiento local se
-- cuantifica en "unidad" pero Fisuras por flexión en "ml"), así que un total
-- compartido por sub-elemento mezclaría unidades incompatibles en la Ec. 1.
CREATE TABLE pathology_records (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_subelement_id TEXT NOT NULL REFERENCES inspection_subelements(id) ON DELETE CASCADE,
  pathology_code           TEXT NOT NULL REFERENCES wabim_pathology_types(code),
  measured_value           DOUBLE PRECISION NOT NULL,
  total_measure            DOUBLE PRECISION NOT NULL,
  description              TEXT,
  location                 TEXT,
  extent                   TEXT,
  quantity                 DOUBLE PRECISION,
  length                   DOUBLE PRECISION,
  area                     DOUBLE PRECISION,
  depth                    DOUBLE PRECISION,
  width                    DOUBLE PRECISION,
  affectation_level        TEXT,
  notes                    TEXT,
  density_pct              DOUBLE PRECISION,
  dc_used                  INTEGER,
  ic_used                  DOUBLE PRECISION,
  wap                      DOUBLE PRECISION,
  low_max_used             DOUBLE PRECISION,
  high_min_used            DOUBLE PRECISION,
  calculated_at            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pathology_subelement ON pathology_records(inspection_subelement_id);

CREATE TABLE photos (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  url                   TEXT NOT NULL,
  caption               TEXT,
  latitude              DOUBLE PRECISION,
  longitude             DOUBLE PRECISION,
  taken_at              TIMESTAMPTZ,
  annotations           JSONB,
  kind                  "PhotoKind" NOT NULL DEFAULT 'DAMAGE',
  inspection_id         TEXT REFERENCES inspections(id) ON DELETE CASCADE,
  inspection_element_id TEXT REFERENCES inspection_elements(id) ON DELETE CASCADE,
  pathology_record_id   TEXT REFERENCES pathology_records(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Resultados de cálculo (auditoría) -------------------------------------------------
CREATE TABLE element_results (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_element_id TEXT NOT NULL UNIQUE REFERENCES inspection_elements(id) ON DELETE CASCADE,
  ec_used               DOUBLE PRECISION NOT NULL,
  dae                   DOUBLE PRECISION NOT NULL,
  sum_wap               DOUBLE PRECISION NOT NULL,
  sum_dc_ic             DOUBLE PRECISION NOT NULL,
  has_data              BOOLEAN NOT NULL,
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subcategory_results (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_id    TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  subcategory_code TEXT NOT NULL REFERENCES wabim_subcategories(code),
  cec_used         DOUBLE PRECISION NOT NULL,
  dasc             DOUBLE PRECISION NOT NULL,
  sum_dae_ec       DOUBLE PRECISION NOT NULL,
  sum_ec           DOUBLE PRECISION NOT NULL,
  has_data         BOOLEAN NOT NULL,
  calculated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, subcategory_code)
);

CREATE TABLE inspection_results (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inspection_id   TEXT NOT NULL UNIQUE REFERENCES inspections(id) ON DELETE CASCADE,
  dta             DOUBLE PRECISION NOT NULL,
  sum_dasc_cec    DOUBLE PRECISION NOT NULL,
  sum_cec         DOUBLE PRECISION NOT NULL,
  condition       "BridgeCondition" NOT NULL,
  recommendation  TEXT NOT NULL,
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

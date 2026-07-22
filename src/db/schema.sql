-- =============================================================================
-- WABIM Bridges — esquema SQLite para el servidor de demostración
-- =============================================================================
-- Espejo funcional de prisma/schema.prisma (PostgreSQL). Se usa SQLite aquí
-- únicamente porque este entorno de desarrollo no tiene acceso a internet
-- para descargar el motor de Prisma / un servidor PostgreSQL gestionado por
-- npm; la aplicación de producción debe usar prisma/schema.prisma tal cual.
-- Tipos: SQLite es dinámico, se usan afinidades TEXT/REAL/INTEGER equivalentes.
-- =============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'INSPECTOR',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bridges (
  id                            TEXT PRIMARY KEY,
  code                          TEXT NOT NULL UNIQUE,
  name                          TEXT NOT NULL,
  municipality                  TEXT,
  department                    TEXT,
  latitude                      REAL,
  longitude                     REAL,
  route                         TEXT,
  route_code                    TEXT,
  concession                    INTEGER,
  km                            REAL,
  skew                          REAL,
  structural_type_transverse    TEXT,
  structural_type_longitudinal  TEXT,
  number_of_spans               INTEGER,
  length                        REAL,
  width                         REAL,
  gauge                         REAL,
  material                      TEXT,
  construction_year             INTEGER,
  owner                         TEXT,
  entity                        TEXT,
  notes                         TEXT,
  main_photo_url                TEXT,
  created_at                    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bridge_documents (
  id         TEXT PRIMARY KEY,
  bridge_id  TEXT NOT NULL REFERENCES bridges(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  type       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inspections (
  id             TEXT PRIMARY KEY,
  bridge_id      TEXT NOT NULL REFERENCES bridges(id) ON DELETE CASCADE,
  scheduled_date TEXT,
  executed_date  TEXT,
  time           TEXT,
  weather        TEXT,
  equipment      TEXT,
  status         TEXT NOT NULL DEFAULT 'SCHEDULED',
  priority       TEXT NOT NULL DEFAULT 'MEDIUM',
  notes          TEXT,
  inspector_id   TEXT REFERENCES users(id),
  coordinator_id TEXT REFERENCES users(id),
  responsible_name       TEXT,
  responsible_id_number  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Catálogo WABIM / INVÍAS -------------------------------------------------

CREATE TABLE IF NOT EXISTS wabim_subcategories (
  code   TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  cec    REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'WABIM'
);

CREATE TABLE IF NOT EXISTS wabim_elements (
  code              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  subcategory_code  TEXT NOT NULL REFERENCES wabim_subcategories(code),
  ec                REAL NOT NULL,
  source            TEXT NOT NULL DEFAULT 'WABIM',
  invias_ref        TEXT
);

CREATE TABLE IF NOT EXISTS wabim_subelements (
  code         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  element_code TEXT NOT NULL REFERENCES wabim_elements(code),
  ic           REAL NOT NULL,
  unit         TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'WABIM',
  invias_ref   TEXT
);

CREATE TABLE IF NOT EXISTS wabim_pathology_types (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  subelement_code TEXT NOT NULL REFERENCES wabim_subelements(code),
  unit            TEXT NOT NULL,
  low_max         REAL NOT NULL,
  high_min        REAL NOT NULL,
  source          TEXT NOT NULL DEFAULT 'WABIM',
  note            TEXT
);

-- --- Captura de campo --------------------------------------------------------

CREATE TABLE IF NOT EXISTS inspection_elements (
  id             TEXT PRIMARY KEY,
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
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inspection_subelements (
  id                     TEXT PRIMARY KEY,
  inspection_element_id  TEXT NOT NULL REFERENCES inspection_elements(id) ON DELETE CASCADE,
  subelement_code        TEXT NOT NULL REFERENCES wabim_subelements(code),
  ic_used                REAL NOT NULL,
  label                  TEXT
);

-- `total_measure` vive en pathology_records (no en inspection_subelements):
-- el Anexo C [INVIAS] asigna unidades distintas a patologías del mismo
-- sub-elemento (p.ej. "Diseño" mezcla daños en "unidad" y en "ml"), así que
-- un total compartido por sub-elemento mezclaría unidades incompatibles.
CREATE TABLE IF NOT EXISTS pathology_records (
  id                        TEXT PRIMARY KEY,
  inspection_subelement_id  TEXT NOT NULL REFERENCES inspection_subelements(id) ON DELETE CASCADE,
  pathology_code            TEXT NOT NULL REFERENCES wabim_pathology_types(code),
  measured_value            REAL NOT NULL,
  total_measure             REAL NOT NULL,
  description               TEXT,
  location                  TEXT,
  extent                    TEXT,
  quantity                  REAL,
  length                    REAL,
  area                      REAL,
  depth                     REAL,
  width                     REAL,
  affectation_level         TEXT,
  notes                     TEXT,
  density_pct               REAL,
  dc_used                   INTEGER,
  ic_used                   REAL,
  wap                       REAL,
  low_max_used              REAL,
  high_min_used             REAL,
  calculated_at             TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

-- `kind` distingue las fotos panorámicas generales de la estructura (ligadas
-- directamente a la inspección vía inspection_id, sin elemento/patología) de
-- las fotos de daño puntual (ligadas a inspection_element_id / pathology_record_id).
CREATE TABLE IF NOT EXISTS photos (
  id                    TEXT PRIMARY KEY,
  url                   TEXT NOT NULL,
  caption               TEXT,
  latitude              REAL,
  longitude             REAL,
  taken_at              TEXT,
  annotations           TEXT,
  kind                  TEXT NOT NULL DEFAULT 'DAMAGE',
  inspection_id         TEXT REFERENCES inspections(id) ON DELETE CASCADE,
  inspection_element_id TEXT REFERENCES inspection_elements(id) ON DELETE CASCADE,
  pathology_record_id   TEXT REFERENCES pathology_records(id) ON DELETE CASCADE,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --- Resultados de cálculo (auditoría) ---------------------------------------

CREATE TABLE IF NOT EXISTS element_results (
  id                     TEXT PRIMARY KEY,
  inspection_element_id  TEXT NOT NULL UNIQUE REFERENCES inspection_elements(id) ON DELETE CASCADE,
  ec_used                REAL NOT NULL,
  dae                    REAL NOT NULL,
  sum_wap                REAL NOT NULL,
  sum_dc_ic              REAL NOT NULL,
  has_data               INTEGER NOT NULL,
  calculated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subcategory_results (
  id                TEXT PRIMARY KEY,
  inspection_id     TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  subcategory_code  TEXT NOT NULL REFERENCES wabim_subcategories(code),
  cec_used          REAL NOT NULL,
  dasc              REAL NOT NULL,
  sum_dae_ec        REAL NOT NULL,
  sum_ec            REAL NOT NULL,
  has_data          INTEGER NOT NULL,
  calculated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(inspection_id, subcategory_code)
);

CREATE TABLE IF NOT EXISTS inspection_results (
  id              TEXT PRIMARY KEY,
  inspection_id   TEXT NOT NULL UNIQUE REFERENCES inspections(id) ON DELETE CASCADE,
  dta             REAL NOT NULL,
  sum_dasc_cec    REAL NOT NULL,
  sum_cec         REAL NOT NULL,
  condition       TEXT NOT NULL,
  recommendation  TEXT NOT NULL,
  calculated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inspections_bridge ON inspections(bridge_id);
CREATE INDEX IF NOT EXISTS idx_insp_elements_inspection ON inspection_elements(inspection_id);
CREATE INDEX IF NOT EXISTS idx_insp_subelements_element ON inspection_subelements(inspection_element_id);
CREATE INDEX IF NOT EXISTS idx_pathology_subelement ON pathology_records(inspection_subelement_id);

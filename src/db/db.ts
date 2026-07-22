/**
 * Capa de persistencia del servidor de demostración.
 *
 * Usa el módulo nativo `node:sqlite` (incluido en Node.js >= 22.5, sin
 * dependencias externas) en lugar de PostgreSQL + Prisma porque el entorno
 * en el que se generó este proyecto no tiene acceso a internet para
 * descargar el motor de Prisma ni paquetes npm. El esquema relacional es un
 * espejo funcional de prisma/schema.prisma (ver ese archivo para el modelo
 * PostgreSQL "objetivo" que debe usarse en producción).
 *
 * Todas las consultas están aisladas en este módulo: para migrar a
 * PostgreSQL/Prisma solo hay que reescribir este archivo (y los que lo
 * importan en src/server/routes/*) usando `PrismaClient`; el motor de
 * cálculo (src/wabim) permanece intacto.
 */
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = join(DATA_DIR, "wabim.sqlite");

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

const schemaSql = readFileSync(join(__dirname, "schema.sql"), "utf-8");
db.exec(schemaSql);

export function newId(): string {
  return randomUUID();
}

/** Ejecuta `fn` como una transacción SQLite (BEGIN/COMMIT/ROLLBACK). */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

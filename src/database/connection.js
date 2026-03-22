// Singleton de conexión a SQLite: inicializa la DB y aplica el esquema al arrancar

import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR    = join(__dirname, '../../db');
const DB_PATH   = join(DB_DIR, 'orders.db');
const SCHEMA    = join(__dirname, '../../db/schema.sql');

let db;

export function getDb() {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });

    db = new Database(DB_PATH);
    // WAL mode mejora la concurrencia en lecturas simultáneas
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Aplicar esquema al iniciar (CREATE TABLE IF NOT EXISTS → idempotente)
    const schema = readFileSync(SCHEMA, 'utf8');
    db.exec(schema);
  }
  return db;
}

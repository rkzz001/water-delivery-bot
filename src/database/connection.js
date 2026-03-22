// Singleton de conexión a SQLite: inicializa la DB y aplica el esquema al arrancar

import sqlite3 from 'node-sqlite3-wasm';
const { Database } = sqlite3;
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR    = join(__dirname, '../../db');
const DB_PATH   = join(DB_DIR, 'orders.db');
const SCHEMA    = join(__dirname, '../../db/schema.sql');

let db;

export function getDb() {
  if (!db) {
    // Asegurar que el directorio db/ existe antes de crear el archivo
    mkdirSync(DB_DIR, { recursive: true });

    db = new Database(DB_PATH);

    // WAL mode y foreign keys via SQL (node-sqlite3-wasm no tiene .pragma())
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");

    // Aplicar esquema al iniciar (CREATE TABLE IF NOT EXISTS → idempotente)
    const schema = readFileSync(SCHEMA, 'utf8');
    db.exec(schema);
  }
  return db;
}

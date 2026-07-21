import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { migrations } from "./migrations";
export const LOCAL_USER_ID = "local-user"; let active: Database.Database | undefined;
export const databasePath = (userData: string) => join(userData, "data", "trip-planner.db");
export function openDatabase(userData: string) { if (active) return active; const file = databasePath(userData); mkdirSync(dirname(file), { recursive: true }); const db = new Database(file); db.pragma("foreign_keys = ON"); db.pragma("journal_mode = WAL"); db.pragma("busy_timeout = 5000"); db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"); db.transaction(() => { for (const migration of migrations) if (!db.prepare("SELECT 1 FROM schema_migrations WHERE version=?").get(migration.version)) { db.exec(migration.sql); db.prepare("INSERT INTO schema_migrations(version)VALUES(?)").run(migration.version); } })(); if (db.pragma("foreign_keys", { simple: true }) !== 1) throw Error("SQLITE_FOREIGN_KEYS_DISABLED"); db.prepare("INSERT OR IGNORE INTO users(id,email,display_name)VALUES(?,?,?)").run(LOCAL_USER_ID, "local-user", "本地用户"); active = db; return db; }
export function closeDatabase() { active?.close(); active = undefined; }

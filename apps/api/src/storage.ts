import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { NeonStore } from './neon-store';

export type User = { id: string; email: string; name: string; salt: string; hash: string; profile: string; deleting?: boolean };
export type StoredDocument = { id: string; user_id: string; name: string; category: string; mime: string; size: number; created: string; nonce: Buffer; tag: Buffer; content: Buffer };
export type DocumentInfo = Pick<StoredDocument, 'id' | 'name' | 'category' | 'mime' | 'size' | 'created'>;
export interface AccountStore {
  readonly kind: string;
  initialize(): Promise<void>;
  createUser(user: User): Promise<void>;
  userByEmail(email: string): Promise<User | undefined>;
  userBySession(token: string, now: number): Promise<User | undefined>;
  createSession(token: string, userId: string, expires: number): Promise<void>;
  deleteSession(token: string): Promise<void>;
  updateProfile(userId: string, profile: string): Promise<void>;
  documents(userId: string): Promise<DocumentInfo[]>;
  putDocument(document: StoredDocument): Promise<void>;
  document(userId: string, id: string): Promise<StoredDocument | undefined>;
  removeDocument(userId: string, id: string): Promise<void>;
  deleteUser(user: User): Promise<void>;
  allowAttempt(key: string, now: number): Promise<boolean>;
}

class LocalStore implements AccountStore {
  readonly kind = 'sqlite';
  async initialize() {}
  private db: DatabaseSync;
  private attempts = new Map<string, { count: number; expires: number }>();
  constructor() {
    const directory = resolve(process.env.DATA_DIRECTORY || '../../.data');
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(resolve(directory, 'houseworthit.sqlite'));
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, profile TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, category TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created TEXT NOT NULL, nonce BLOB NOT NULL, tag BLOB NOT NULL, content BLOB NOT NULL);`);
  }
  async createUser(user: User) { this.db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(user.id, user.email, user.name, user.salt, user.hash, user.profile); }
  async userByEmail(email: string) { return this.db.prepare('SELECT * FROM users WHERE email=?').get(email) as User | undefined; }
  async userBySession(token: string, now: number) { return this.db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(token, now) as User | undefined; }
  async createSession(token: string, userId: string, expires: number) {
    this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(token, userId, expires);
  }
  async deleteSession(token: string) { this.db.prepare('DELETE FROM sessions WHERE token=?').run(token); }
  async updateProfile(userId: string, profile: string) { this.db.prepare('UPDATE users SET profile=? WHERE id=?').run(profile, userId); }
  async documents(userId: string) { return this.db.prepare('SELECT id,name,category,mime,size,created FROM documents WHERE user_id=? ORDER BY created DESC').all(userId) as DocumentInfo[]; }
  async putDocument(doc: StoredDocument) {
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM documents WHERE user_id=?').get(doc.user_id) as { n: number };
    if (count.n >= 20) throw new Error('Document limit reached. Remove a file before uploading another.');
    this.db.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?)').run(doc.id, doc.user_id, doc.name, doc.category, doc.mime, doc.size, doc.created, doc.nonce, doc.tag, doc.content);
  }
  async document(userId: string, id: string) { return this.db.prepare('SELECT * FROM documents WHERE id=? AND user_id=?').get(id, userId) as StoredDocument | undefined; }
  async removeDocument(userId: string, id: string) { this.db.prepare('DELETE FROM documents WHERE id=? AND user_id=?').run(id, userId); }
  async deleteUser(user: User) { this.db.prepare('DELETE FROM users WHERE id=?').run(user.id); }
  async allowAttempt(key: string, now: number) {
    for (const [id, state] of this.attempts) if (state.expires < now) this.attempts.delete(id);
    const state = this.attempts.get(key) || { count: 0, expires: now + 900000 };
    state.count++; this.attempts.set(key, state);
    return state.count <= 30;
  }
}

if (process.env.K_SERVICE && process.env.STORAGE_BACKEND !== 'neon') throw new Error('Cloud Run requires durable Neon storage.');
if (process.env.STORAGE_BACKEND === 'neon' && (!process.env.DATABASE_URL || !process.env.DOCUMENT_BUCKET || !process.env.DOCUMENT_KEY)) throw new Error('Neon hosting requires database, private bucket, and encryption key configuration.');
export const store: AccountStore = process.env.STORAGE_BACKEND === 'neon' ? new NeonStore() : new LocalStore();
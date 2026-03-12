const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'vibenote.sqlite');

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// sql.js wrapper to mimic better-sqlite3 synchronous API
class SqlJsDb {
  constructor(sqlJs, buffer) {
    this.db = buffer ? new sqlJs.Database(buffer) : new sqlJs.Database();
    this.sqlJs = sqlJs;
    this._saveTimer = null;
  }

  // Save database to disk (debounced)
  _save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const data = this.db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
      } catch (e) {
        console.error('[DB] Save error:', e.message);
      }
    }, 200);
  }

  // Execute SQL with no return value (CREATE, INSERT, UPDATE, DELETE)
  exec(sql) {
    this.db.run(sql);
    this._save();
    return this;
  }

  // pragma — sql.js doesn't support all pragmas, handle gracefully
  pragma(statement) {
    try { this.db.run(`PRAGMA ${statement}`); } catch (e) { /* ignore unsupported pragmas */ }
    return this;
  }

  // prepare returns a statement-like object
  prepare(sql) {
    const db = this;
    return {
      // Run INSERT/UPDATE/DELETE — returns { lastInsertRowid, changes }
      run(...params) {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        db.db.run(sql, flatParams);
        const lastId = db.db.exec('SELECT last_insert_rowid() as id')[0];
        const lastInsertRowid = lastId ? lastId.values[0][0] : null;
        db._save();
        return { lastInsertRowid, changes: 1 };
      },

      // Get single row — returns object or undefined
      get(...params) {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const results = db.db.exec(sql, flatParams);
        if (!results.length || !results[0].values.length) return undefined;
        const cols = results[0].columns;
        const row = results[0].values[0];
        return Object.fromEntries(cols.map((c, i) => [c, row[i]]));
      },

      // All rows — returns array of objects
      all(...params) {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const results = db.db.exec(sql, flatParams);
        if (!results.length) return [];
        const cols = results[0].columns;
        return results[0].values.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
      }
    };
  }

  // Transaction wrapper
  transaction(fn) {
    return () => {
      this.db.run('BEGIN');
      try {
        fn();
        this.db.run('COMMIT');
      } catch (e) {
        this.db.run('ROLLBACK');
        throw e;
      }
      this._save();
    };
  }
}

// Initialize database synchronously using a flag file approach
let _db = null;

function getDb() {
  if (_db) return _db;
  throw new Error('Database not initialized. Call initDb() first.');
}

// Proxy object that always calls getDb() — allows synchronous-style usage
const dbProxy = new Proxy({}, {
  get(_, prop) {
    return (...args) => getDb()[prop](...args);
  }
});

// We need async init — export a promise and also a sync proxy
async function initDb() {
  const SQL = await initSqlJs();

  let buffer = null;
  if (fs.existsSync(dbPath)) {
    buffer = fs.readFileSync(dbPath);
  }

  _db = new SqlJsDb(SQL, buffer);

  // Create tables
  _db.db.run(`
    CREATE TABLE IF NOT EXISTS agencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      site_credits INTEGER DEFAULT 1,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      razorpay_subscription_id TEXT,
      sftp_host TEXT,
      sftp_user TEXT,
      sftp_pass TEXT,
      sftp_base_path TEXT DEFAULT '/public_html',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  _db.db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      industry TEXT,
      form_data TEXT DEFAULT '{}',
      generated_html TEXT,
      status TEXT DEFAULT 'draft',
      deployment_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  _db.db.run(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  _db.db.run(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referred_id INTEGER NOT NULL,
      converted INTEGER DEFAULT 0,
      credit_awarded INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  _db._save();
  console.log('[DB] SQLite initialized via sql.js');
  return _db;
}

// Export both the init function and a getter
module.exports = {
  initDb,
  getDb: () => _db
};

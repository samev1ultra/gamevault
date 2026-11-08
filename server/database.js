
const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'gamevault.db'))

db.pragma('journal_mode = WAL')

// Create the games table with the expanded schema
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appid INTEGER UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    developer TEXT,
    publisher TEXT,
    release_date TEXT,
    image TEXT,
    website TEXT,
    genres TEXT,
    platforms TEXT,
    metacritic_score INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Safely upgrade databases created with the older schema
const existingColumns = db
  .prepare('PRAGMA table_info(games)')
  .all()
  .map((column) => column.name)

const newColumns = [
  ['genres', 'TEXT'],
  ['platforms', 'TEXT'],
  ['metacritic_score', 'INTEGER'],
]

for (const [columnName, columnType] of newColumns) {
  if (!existingColumns.includes(columnName)) {
    db.exec(
      `ALTER TABLE games ADD COLUMN ${columnName} ${columnType}`
    )

    console.log(`Database upgraded: added ${columnName}`)
  }
}

console.log('GameVault database initialized!')

module.exports = db

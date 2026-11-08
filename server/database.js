const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'gamevault.db'))

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS user_game_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'local',
    appid INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'steam',
    action TEXT NOT NULL CHECK (action IN ('favorite', 'vault', 'wishlist')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, appid, source, action)
  )
`)

console.log('GameVault user-actions database initialized.')

module.exports = db

const express = require('express')
const cors = require('cors')
const db = require('./database')
const { GENRES, searchSteamGames, getSteamGameDetails, discoverSteamGames } = require('./steam')

const app = express()
const PORT = process.env.PORT || 3001
const USER_ID = 'local'

app.use(cors())
app.use(express.json({ limit: '32kb' }))

app.get('/', (req, res) => res.json({ message: 'GameVault API is running!', status: 'success' }))
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'GameVault API' }))

// Live Steam autocomplete/search. Search results are never written to SQLite.
app.get('/api/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim().slice(0, 100)
    if (query.length < 2) return res.json({ games: [], total: 0, source: 'steam' })
    const games = await searchSteamGames(query)
    res.set('Cache-Control', 'no-store')
    res.json({ games, total: games.length, source: 'steam' })
  } catch (error) {
    console.error('Search error:', error)
    res.status(502).json({ error: 'Steam search is temporarily unavailable.' })
  }
})

// Fetch full details only when a user opens a game.
app.get('/api/steam/games/:appid', async (req, res) => {
  try {
    const appid = String(req.params.appid)
    if (!/^\d{1,12}$/.test(appid)) return res.status(400).json({ error: 'A valid Steam AppID is required.' })
    const game = await getSteamGameDetails(appid)
    res.json({ game })
  } catch (error) {
    console.error('Game details error:', error)
    res.status(error.status || 502).json({ error: error.message || 'Could not retrieve game details.' })
  }
})

// One request per genre lets the frontend display each completed batch progressively.
// Discovery results are temporary; only explicit personal-library actions are persisted.
app.get('/api/discover', async (req, res) => {
  try {
    const genres = [...new Set(String(req.query.genres || 'Action,Adventure').split(',').map((item) => item.trim()).filter(Boolean))]
    const invalidGenres = genres.filter((genre) => !GENRES.includes(genre))
    if (!genres.length || invalidGenres.length) {
      return res.status(400).json({ error: invalidGenres.length ? `Unsupported genre: ${invalidGenres.join(', ')}` : 'Choose at least one genre.', allowedGenres: GENRES })
    }
    const limit = Number(req.query.limit ?? 3)
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      return res.status(400).json({ error: 'Limit must be a whole number from 1 to 10.' })
    }
    const result = await discoverSteamGames({ genres, limit })
    res.set('Cache-Control', 'no-store')
    res.json(result)
  } catch (error) {
    console.error('Discovery error:', error)
    res.status(502).json({ error: error.message || 'Steam discovery failed.' })
  }
})

// Saved actions are loaded from SQLite; game metadata is refreshed from Steam.
app.get('/api/actions', async (req, res) => {
  try {
    const rows = db.prepare(`SELECT appid, source, action, created_at FROM user_game_actions WHERE user_id = ? ORDER BY created_at DESC`).all(USER_ID)
    const saved = await Promise.all(rows.map(async (row) => {
      try {
        const game = row.source === 'steam' ? await getSteamGameDetails(row.appid) : null
        return { ...row, game }
      } catch {
        return { ...row, game: null }
      }
    }))
    res.json({ saved })
  } catch (error) {
    console.error('Saved actions error:', error)
    res.status(500).json({ error: 'Could not load saved games.' })
  }
})

// Persist only a deliberate user action: favourite, vault, or wishlist.
app.post('/api/actions', (req, res) => {
  try {
    const appid = Number(req.body.appid)
    const source = String(req.body.source || 'steam')
    const action = String(req.body.action || '')
    if (!Number.isSafeInteger(appid) || appid <= 0) return res.status(400).json({ error: 'A valid AppID is required.' })
    if (source !== 'steam') return res.status(400).json({ error: 'Unsupported game source.' })
    if (!['favorite', 'vault', 'wishlist'].includes(action)) return res.status(400).json({ error: 'Invalid save action.' })
    db.prepare(`INSERT INTO user_game_actions (user_id, appid, source, action) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, appid, source, action) DO NOTHING`).run(USER_ID, appid, source, action)
    res.json({ success: true, appid, source, action })
  } catch (error) {
    console.error('Save action error:', error)
    res.status(500).json({ error: 'Could not save this game.' })
  }
})

// Remove one action without affecting the other saved actions for that game.
app.delete('/api/actions/:appid/:action', (req, res) => {
  try {
    const appid = Number(req.params.appid)
    const action = String(req.params.action)
    if (!Number.isSafeInteger(appid) || appid <= 0 || !['favorite', 'vault', 'wishlist'].includes(action)) {
      return res.status(400).json({ error: 'Invalid saved-game action.' })
    }
    db.prepare(`DELETE FROM user_game_actions WHERE user_id = ? AND appid = ? AND source = 'steam' AND action = ?`).run(USER_ID, appid, action)
    res.json({ success: true, appid, action, removed: true })
  } catch (error) {
    console.error('Remove action error:', error)
    res.status(500).json({ error: 'Could not remove this saved action.' })
  }
})

app.get('/api/genres', (req, res) => res.json({ genres: GENRES }))
app.listen(PORT, () => console.log(`GameVault server running at http://localhost:${PORT}`))

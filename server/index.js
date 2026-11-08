
const express = require('express')
const cors = require('cors')
const db = require('./database')
const { discoverAndImport } = require('./steam')

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Check server status
app.get('/', (req, res) => {
  res.json({
    message: 'GameVault API is running!',
    status: 'success',
  })
})

// Get all imported games
app.get('/api/games', (req, res) => {
  try {
    const games = db
      .prepare('SELECT * FROM games ORDER BY created_at DESC')
      .all()

    res.json({
      total: games.length,
      games,
    })
  } catch (error) {
    console.error('Database error:', error)

    res.status(500).json({
      error: 'Failed to retrieve games',
    })
  }
})

// Automatically discover and import games from Steam
// Keep this route before /api/import/:appid
app.post('/api/import/discover', async (req, res) => {
  try {
    const genres = req.query.genres
      ? req.query.genres.split(',').map((genre) => genre.trim())
      : ['Action', 'Adventure']

    const limitPerCategory = Number(req.query.limit) || 1

    const result = await discoverAndImport(db, {
      genres,
      limitPerCategory,
    })

    res.json(result)
  } catch (error) {
    console.error('Discovery error:', error)

    res.status(500).json({
      error: 'Steam discovery failed',
      details: error.message,
    })
  }
})

// Manually import one game using its Steam AppID
app.post('/api/import/:appid', async (req, res) => {
  try {
    const appid = Number(req.params.appid)

    if (!Number.isSafeInteger(appid) || appid <= 0) {
      return res.status(400).json({
        error: 'Invalid Steam AppID',
      })
    }

    const response = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`
    )

    if (!response.ok) {
      return res.status(502).json({
        error: 'Steam API request failed',
      })
    }

    const result = await response.json()
    const gameData = result[appid]

    if (!gameData || !gameData.success || !gameData.data) {
      return res.status(404).json({
        error: 'Game not found on Steam',
      })
    }

    const game = gameData.data

    if (game.type !== 'game') {
      return res.status(400).json({
        error: 'This Steam AppID is not a game',
      })
    }

    // Extract actual Steam genres
    const genres = (game.genres || [])
      .map((genre) => genre.description)
      .filter(Boolean)

    // Extract supported platforms
    const platforms = []

    if (game.platforms?.windows) platforms.push('Windows')
    if (game.platforms?.mac) platforms.push('Mac')
    if (game.platforms?.linux) platforms.push('Linux')

    // Extract Metacritic score when available
    const score = Number(game.metacritic?.score)

    const metacriticScore = Number.isInteger(score)
      ? score
      : null

    const statement = db.prepare(`
      INSERT INTO games (
        appid,
        title,
        description,
        developer,
        publisher,
        release_date,
        image,
        website,
        genres,
        platforms,
        metacritic_score
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

      ON CONFLICT(appid) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        developer = excluded.developer,
        publisher = excluded.publisher,
        release_date = excluded.release_date,
        image = excluded.image,
        website = excluded.website,
        genres = excluded.genres,
        platforms = excluded.platforms,
        metacritic_score = excluded.metacritic_score,
        updated_at = CURRENT_TIMESTAMP
    `)

    statement.run(
      appid,
      game.name,
      game.short_description || '',
      (game.developers || []).join(', '),
      (game.publishers || []).join(', '),
      game.release_date?.date || '',
      game.header_image || '',
      game.website || '',
      JSON.stringify(genres),
      JSON.stringify(platforms),
      metacriticScore
    )

    res.json({
      message: 'Game imported successfully!',
      game: {
        appid,
        title: game.name,
        genres,
        platforms,
        metacriticScore,
      },
    })
  } catch (error) {
    console.error('Import error:', error)

    res.status(500).json({
      error: 'Failed to import game',
      details: error.message,
    })
  }
})

app.listen(PORT, () => {
  console.log(`GameVault server running at http://localhost:${PORT}`)
})

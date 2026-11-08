
const GAME_GENRES = [
  'Action',
  'Adventure',
  'Strategy',
  'RPG',
  'Indie',
  'Massively Multiplayer',
  'Casual',
  'Simulation',
  'Racing',
  'Sports',
]

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

async function fetchSteamJSON(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Steam returned HTTP ${response.status}`)
  }

  return response.json()
}

// Convert Steam game details into database values
function getGameMetadata(game) {
  const genres = (game.genres || [])
    .map((genre) => genre.description)
    .filter(Boolean)

  const platforms = []

  if (game.platforms?.windows) platforms.push('Windows')
  if (game.platforms?.mac) platforms.push('Mac')
  if (game.platforms?.linux) platforms.push('Linux')

  const score = Number(game.metacritic?.score)

  return {
    genres: JSON.stringify(genres),
    platforms: JSON.stringify(platforms),
    metacriticScore: Number.isInteger(score) ? score : null,
  }
}

async function discoverAndImport(db, options = {}) {
  const requestedGenres = options.genres || ['Action', 'Adventure']

  const limitPerCategory = Math.min(
    Math.max(Number(options.limitPerCategory) || 1, 1),
    10
  )

  const genres = requestedGenres.filter((genre) =>
    GAME_GENRES.includes(genre)
  )

  if (genres.length === 0) {
    throw new Error('No valid game genres were selected.')
  }

  console.log('Starting Steam game discovery...')

  // Step 1: Get Steam's genre list
  const genreData = await fetchSteamJSON(
    'https://store.steampowered.com/api/getgenrelist/?cc=us&l=en'
  )

  if (genreData.status !== 1 || !Array.isArray(genreData.genres)) {
    throw new Error('Could not retrieve Steam genres.')
  }

  const availableGenres = new Set(
    genreData.genres.map((genre) => genre.id)
  )

  const validGenres = genres.filter((genre) =>
    availableGenres.has(genre)
  )

  // Step 2: Discover AppIDs
  const appIds = new Set()
  const discoveryErrors = []

  for (const genre of validGenres) {
    console.log(`Checking genre: ${genre}`)

    try {
      const url =
        `https://store.steampowered.com/api/getappsingenre/` +
        `?genre=${encodeURIComponent(genre)}&cc=us&l=en`

      const data = await fetchSteamJSON(url)

      if (data.status !== 1 || !data.tabs) {
        throw new Error('Unexpected genre response.')
      }

      const categories = ['comingsoon', 'newreleases']

      for (const category of categories) {
        const items = data.tabs[category]?.items || []

        const gameItems = items
          .filter((item) => item.type === 0 && item.id)
          .slice(0, limitPerCategory)

        for (const item of gameItems) {
          appIds.add(Number(item.id))
        }
      }
    } catch (error) {
      console.error(`Failed to check ${genre}:`, error.message)

      discoveryErrors.push({
        genre,
        error: error.message,
      })
    }

    await delay(300)
  }

  // Step 3: Prepare database insert/update
  const saveGame = db.prepare(`
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

  // Step 4: Fetch details and save each discovered game
  let imported = 0
  let failed = 0
  let skipped = 0

  const importErrors = []

  for (const appid of appIds) {
    try {
      const url =
        `https://store.steampowered.com/api/appdetails/` +
        `?appids=${appid}&cc=us&l=en`

      const result = await fetchSteamJSON(url)
      const gameData = result[appid]

      if (!gameData || !gameData.success || !gameData.data) {
        skipped++
        continue
      }

      const game = gameData.data

      if (game.type !== 'game' || !game.name) {
        skipped++
        continue
      }

      const metadata = getGameMetadata(game)

      saveGame.run(
        appid,
        game.name,
        game.short_description || '',
        (game.developers || []).join(', '),
        (game.publishers || []).join(', '),
        game.release_date?.date || '',
        game.header_image || '',
        game.website || '',
        metadata.genres,
        metadata.platforms,
        metadata.metacriticScore
      )

      imported++

      console.log(`Saved: ${game.name}`)
    } catch (error) {
      failed++

      console.error(`Failed AppID ${appid}:`, error.message)

      importErrors.push({
        appid,
        error: error.message,
      })
    }

    // Keep requests spaced out
    await delay(400)
  }

  console.log('Steam discovery finished.')

  return {
    message: 'Steam discovery completed.',
    genresChecked: validGenres,
    discovered: appIds.size,
    imported,
    skipped,
    failed,
    discoveryErrors,
    importErrors,
  }
}

module.exports = {
  discoverAndImport,
}


const GENRES = [
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

const searchCache = new Map()
const detailsCache = new Map()
const discoveryCache = new Map()

const pendingSearches = new Map()
const pendingDetails = new Map()
const pendingDiscoveries = new Map()

const CACHE_TTL = 5 * 60 * 1000
const DETAILS_CACHE_TTL = 30 * 60 * 1000
const DISCOVERY_CACHE_TTL = 15 * 60 * 1000
const GENRE_CACHE_TTL = 60 * 60 * 1000
const MAX_CONCURRENT_REQUESTS = 5

let genreCache = null

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GameVault/1.0' },
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error(`Steam returned HTTP ${response.status}`)
  }

  return response.json()
}

function cachedGet(cache, key, ttl = CACHE_TTL) {
  const entry = cache.get(key)

  if (!entry || Date.now() - entry.time > ttl) {
    cache.delete(key)
    return null
  }

  return entry.value
}

function cachedSet(cache, key, value) {
  cache.set(key, {
    value,
    time: Date.now(),
  })

  return value
}

async function getGenreList() {
  if (genreCache && Date.now() - genreCache.time < GENRE_CACHE_TTL) {
    return genreCache.value
  }

  const data = await fetchJSON(
    'https://store.steampowered.com/api/getgenrelist/?cc=us&l=en'
  )

  if (data.status !== 1 || !Array.isArray(data.genres)) {
    throw new Error('Steam genre catalogue is temporarily unavailable.')
  }

  genreCache = {
    value: data.genres,
    time: Date.now(),
  }

  return data.genres
}

function normalizeSteamGame(game, appid) {
  const platforms = []

  if (game.platforms?.windows) platforms.push('PC')
  if (game.platforms?.mac) platforms.push('Mac')
  if (game.platforms?.linux) platforms.push('Linux')

  const score = Number(game.metacritic?.score)

  const price = game.is_free
    ? 'Free to Play'
    : game.price_overview?.final_formatted || 'Price unavailable'

  const movies = (game.movies || [])
    .map((movie) => ({
      name: movie.name || 'Official trailer',
      thumbnail: movie.thumbnail || '',
      mp4: movie.mp4?.max || movie.mp4?.['480'] || '',
      webm: movie.webm?.max || movie.webm?.['480'] || '',
    }))
    .filter((movie) => movie.mp4 || movie.webm)

  return {
    appid: Number(appid),
    title: game.name || 'Untitled game',
    description: game.short_description || game.about_the_game || '',
    developer: (game.developers || []).join(', ') || 'Unknown developer',
    publisher: (game.publishers || []).join(', '),
    date: game.release_date?.date || '',
    releaseDate: game.release_date?.date || '',
    comingSoon: Boolean(game.release_date?.coming_soon),
    image: game.header_image || '',
    background: game.background || '',
    website: game.website || '',
    genres: (game.genres || [])
      .map((item) => item.description)
      .filter(Boolean),
    platforms,
    score: Number.isInteger(score) ? score : null,
    price,
    isFree: Boolean(game.is_free),
    storeUrl: `https://store.steampowered.com/app/${appid}/`,
    movies,
    screenshots: (game.screenshots || [])
      .map((item) => item.path_full)
      .filter(Boolean),
    type: game.type,
  }
}

async function searchSteamGames(query) {
  const cleanQuery = String(query || '').trim()

  if (cleanQuery.length < 2) return []

  const cacheKey = cleanQuery.toLowerCase()

  const cached = cachedGet(searchCache, cacheKey)

  if (cached !== null) return cached

  if (pendingSearches.has(cacheKey)) {
    return pendingSearches.get(cacheKey)
  }

  const request = (async () => {
    const url =
      'https://store.steampowered.com/api/storesearch/' +
      `?term=${encodeURIComponent(cleanQuery)}&cc=us&l=en`

    const data = await fetchJSON(url)

    const results = (data.items || [])
      .filter((item) => item.type === 'app')
      .slice(0, 10)
      .map((item) => ({
        appid: Number(item.id),
        title: item.name,
        image: item.tiny_image || '',
        price: item.price?.final_formatted || 'Price unavailable',
        platforms: item.platforms || {},
        storeUrl: `https://store.steampowered.com/app/${item.id}/`,
      }))

    return cachedSet(searchCache, cacheKey, results)
  })()

  pendingSearches.set(cacheKey, request)

  try {
    return await request
  } finally {
    pendingSearches.delete(cacheKey)
  }
}

async function getSteamGameDetails(appid) {
  const id = Number(appid)

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Invalid Steam AppID.')
  }

  const key = String(id)

  const cached = cachedGet(detailsCache, key, DETAILS_CACHE_TTL)

  if (cached !== null) return cached

  if (pendingDetails.has(key)) {
    return pendingDetails.get(key)
  }

  const request = (async () => {
    const url =
      'https://store.steampowered.com/api/appdetails/' +
      `?appids=${id}&cc=us&l=en`

    const result = await fetchJSON(url)
    const item = result[id]

    if (!item?.success || !item.data) {
      const error = new Error('Steam could not find this product.')
      error.status = 404
      throw error
    }

    if (item.data.type !== 'game') {
      const error = new Error('This Steam listing is not a game.')
      error.status = 422
      throw error
    }

    return cachedSet(
      detailsCache,
      key,
      normalizeSteamGame(item.data, id)
    )
  })()

  pendingDetails.set(key, request)

  try {
    return await request
  } finally {
    pendingDetails.delete(key)
  }
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const index = nextIndex++

      if (index >= items.length) return

      try {
        results[index] = await callback(items[index])
      } catch (error) {
        results[index] = {
          error: error.message,
        }
      }
    }
  }

  const workerCount = Math.min(limit, items.length)

  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  )

  return results
}

async function discoverSteamGames(options = {}) {
  const requested = Array.isArray(options.genres)
    ? options.genres
    : ['Action', 'Adventure']

  const genres = [...new Set(
    requested.filter((genre) => GENRES.includes(genre))
  )].sort()

  const limit = Math.min(
    Math.max(Number(options.limit) || 3, 1),
    10
  )

  if (!genres.length) {
    throw new Error('Select at least one valid genre.')
  }

  const cacheKey = `${genres.join(',')}|${limit}`

  const cached = cachedGet(
    discoveryCache,
    cacheKey,
    DISCOVERY_CACHE_TTL
  )

  if (cached !== null) return cached

  if (pendingDiscoveries.has(cacheKey)) {
    return pendingDiscoveries.get(cacheKey)
  }

  const request = (async () => {
    const genreData = await getGenreList()

    const available = new Set(
      genreData.map((item) => item.id)
    )

    const validGenres = genres.filter((genre) =>
      available.has(genre)
    )

    const errors = []

    const genreResults = await Promise.all(
      validGenres.map(async (genre) => {
        try {
          const url =
            'https://store.steampowered.com/api/getappsingenre/' +
            `?genre=${encodeURIComponent(genre)}&cc=us&l=en`

          const data = await fetchJSON(url)

          if (data.status !== 1 || !data.tabs) {
            throw new Error('Unexpected Steam genre response.')
          }

          return {
            genre,
            items: [
              ...(data.tabs.comingsoon?.items || []).slice(0, limit),
              ...(data.tabs.newreleases?.items || []).slice(0, limit),
            ],
          }
        } catch (error) {
          errors.push({
            genre,
            error: error.message,
          })

          return {
            genre,
            items: [],
          }
        }
      })
    )

    const appIds = new Set()

    for (const result of genreResults) {
      for (const item of result.items) {
        if (item.type === 0 && item.id) {
          appIds.add(Number(item.id))
        }
      }
    }

    const ids = [...appIds]

    const detailResults = await mapWithConcurrency(
      ids,
      MAX_CONCURRENT_REQUESTS,
      (appid) => getSteamGameDetails(appid)
    )

    const games = []
    let skipped = 0

    for (const result of detailResults) {
      if (result && !result.error) {
        games.push(result)
      } else {
        skipped++
      }
    }

    games.sort((a, b) => {
      if (a.comingSoon !== b.comingSoon) {
        return a.comingSoon ? -1 : 1
      }

      const da = Date.parse(a.date) || Number.MAX_SAFE_INTEGER
      const db = Date.parse(b.date) || Number.MAX_SAFE_INTEGER

      return da - db
    })

    const discoveryResult = {
      games,
      discovered: appIds.size,
      returned: games.length,
      skipped,
      genresChecked: validGenres,
      errors,
      refreshedAt: new Date().toISOString(),
    }

    return cachedSet(
      discoveryCache,
      cacheKey,
      discoveryResult
    )
  })()

  pendingDiscoveries.set(cacheKey, request)

  try {
    return await request
  } finally {
    pendingDiscoveries.delete(cacheKey)
  }
}

module.exports = {
  GENRES,
  searchSteamGames,
  getSteamGameDetails,
  discoverSteamGames,
}

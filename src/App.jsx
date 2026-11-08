
import { useState, useEffect } from 'react'
import {
  Search, Gamepad2, Play, Star, CalendarDays,
  Clock3, X, ChevronRight, ArrowUpRight,
  Menu, ArrowRight
} from 'lucide-react'

// --------------------------------------------------
// Date helpers
// --------------------------------------------------

function parseDate(date) {
  if (!date) return null

  const timestamp = Date.parse(date)

  return Number.isNaN(timestamp) ? null : timestamp
}

function countdown(date, tick) {
  const timestamp = parseDate(date)

  if (!timestamp) return 'Date TBA'

  const releaseDay = new Date(timestamp)
  releaseDay.setHours(0, 0, 0, 0)

  const today = new Date(tick)
  today.setHours(0, 0, 0, 0)

  const diff = releaseDay.getTime() - today.getTime()

  if (diff < 0) return 'Released'
  if (diff === 0) return 'Releases today'

  return `${Math.ceil(diff / 86400000)} days remaining`
}

function formatDate(date) {
  const timestamp = parseDate(date)

  if (!timestamp) return date || 'Date TBA'

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// --------------------------------------------------
// Main application
// --------------------------------------------------

function App() {
  // Game data from the GameVault backend
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState('')

  // UI state
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState('All Games')
  const [platform, setPlatform] = useState('All')
  const [review, setReview] = useState(85)
  const [trailer, setTrailer] = useState(false)
  const [tick, setTick] = useState(Date.now())
  const [mobileMenu, setMobileMenu] = useState(false)

  // ------------------------------------------------
  // Fetch games from backend
  // ------------------------------------------------

  useEffect(() => {
    async function loadGames() {
      try {
        setLoading(true)
        setApiError('')

        const response = await fetch(
          'http://localhost:3001/api/games'
        )

        if (!response.ok) {
          throw new Error(
            'Could not load games from GameVault API.'
          )
        }

        const result = await response.json()

        if (!Array.isArray(result.games)) {
          throw new Error('Invalid response from GameVault API.')
        }

        const normalizedGames = result.games.map((game) => {
          let gameGenres = []
          let gamePlatforms = []

          try {
            gameGenres = JSON.parse(game.genres || '[]')
          } catch {
            gameGenres = []
          }

          try {
            gamePlatforms = JSON.parse(game.platforms || '[]')
          } catch {
            gamePlatforms = []
          }

          // Convert Steam platform names for the UI
          const normalizedPlatforms = gamePlatforms.map((item) => {
            if (item === 'Windows') return 'PC'
            return item
          })

          return {
            id: game.appid,
            appid: game.appid,
            title: game.title || 'Untitled game',
            genre: gameGenres[0] || 'Uncategorized',
            genres: gameGenres,
            platforms: normalizedPlatforms,
            date: game.release_date || '',
            score: game.metacritic_score,
            developer: game.developer || 'Unknown developer',
            publisher: game.publisher || '',
            description: game.description || 'No description available.',
            image: game.image || '',
            website: game.website || ''
          }
        })

        setGames(normalizedGames)
      } catch (error) {
        console.error('GameVault API error:', error)

        setApiError(
          error.message || 'Could not connect to GameVault API.'
        )
      } finally {
        setLoading(false)
      }
    }

    loadGames()
  }, [])

  // ------------------------------------------------
  // Countdown clock
  // ------------------------------------------------

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(Date.now())
    }, 60000)

    return () => clearInterval(timer)
  }, [])

  // ------------------------------------------------
  // Keyboard controls
  // ------------------------------------------------

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setSelected(null)
        setTrailer(false)
        setMobileMenu(false)
      }
    }

    window.addEventListener('keydown', handleKey)

    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [])

  // ------------------------------------------------
  // Dynamic filters
  // ------------------------------------------------

  const availableGenres = [
    ...new Set(games.flatMap((game) => game.genres))
  ].sort()

  const availablePlatforms = [
    ...new Set(games.flatMap((game) => game.platforms))
  ].sort()

  // ------------------------------------------------
  // Search and filtering
  // ------------------------------------------------

  const filtered = games.filter((game) => {
    const matchesGenre =
      genre === 'All Games' || game.genres.includes(genre)

    const matchesPlatform =
      platform === 'All' || game.platforms.includes(platform)

    const matchesSearch =
      game.title.toLowerCase().includes(search.toLowerCase())

    return matchesGenre && matchesPlatform && matchesSearch
  })

  // ------------------------------------------------
  // Upcoming releases
  // ------------------------------------------------

  const upcoming = [...games]
    .filter((game) => {
      const timestamp = parseDate(game.date)

      return !timestamp || timestamp >= new Date(tick).setHours(0, 0, 0, 0)
    })
    .sort((a, b) => {
      const dateA = parseDate(a.date)
      const dateB = parseDate(b.date)

      if (!dateA && !dateB) return 0
      if (!dateA) return 1
      if (!dateB) return -1

      return dateA - dateB
    })

  // ------------------------------------------------
  // Game interactions
  // ------------------------------------------------

  const openGame = (game, showTrailer = false) => {
    setSelected(game)
    setReview(85)
    setTrailer(showTrailer)
  }

  const closeGame = () => {
    setSelected(null)
    setTrailer(false)
  }

  // ------------------------------------------------
  // Loading and error screens
  // ------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#101114] text-[#F0F0ED]">
        <div className="text-center">
          <Gamepad2 className="mx-auto mb-5 text-[#D7FF64]" size={42} />
          <h1 className="font-[Manrope] text-2xl font-extrabold">
            GAME<span className="text-[#D7FF64]">VAULT</span>
          </h1>
          <p className="mt-3 text-sm text-[#A7A9B0]">
            Loading your game collection...
          </p>
        </div>
      </div>
    )
  }

  if (apiError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#101114] px-5 text-[#F0F0ED]">
        <div className="max-w-md text-center">
          <Gamepad2 className="mx-auto mb-5 text-[#D7FF64]" size={42} />
          <h1 className="font-[Manrope] text-2xl font-extrabold">
            GAME<span className="text-[#D7FF64]">VAULT</span>
          </h1>
          <p className="mt-4 text-sm text-red-400">
            {apiError}
          </p>
          <p className="mt-3 text-xs leading-6 text-[#A7A9B0]">
            Make sure the GameVault backend is running on port 3001,
            then refresh this page.
          </p>
        </div>
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#101114] px-5 text-center text-[#F0F0ED]">
        <div>
          <Gamepad2 className="mx-auto mb-5 text-[#D7FF64]" size={42} />
          <h1 className="font-[Manrope] text-2xl font-extrabold">
            GAME<span className="text-[#D7FF64]">VAULT</span>
          </h1>
          <p className="mt-4 text-sm text-[#A7A9B0]">
            No games found. Import some games to get started.
          </p>
        </div>
      </div>
    )
  }

  const featuredGame = games[0]

  return (
    <div className="min-h-screen bg-[#101114] text-[#F0F0ED]">

      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-[#303239] bg-[#101114]/95 backdrop-blur-md">
        <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 md:px-10">

          <a href="#" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center bg-[#D7FF64] text-[#101114]">
              <Gamepad2 size={23} />
            </span>
            <span className="font-[Manrope] text-xl font-extrabold tracking-tight">
              GAME<span className="text-[#D7FF64]">VAULT</span>
            </span>
          </a>

          <div className="hidden items-center gap-9 text-sm font-medium text-[#A7A9B0] md:flex">
            <a href="#discover" className="transition hover:text-[#D7FF64]">Discover</a>
            <a href="#upcoming" className="transition hover:text-[#D7FF64]">Release calendar</a>
            <a href="#about" className="transition hover:text-[#D7FF64]">About</a>
          </div>

          <a
            href="#discover"
            className="hidden items-center gap-2 bg-[#D7FF64] px-5 py-3 text-sm font-bold text-[#101114] transition hover:bg-white md:flex"
          >
            Explore games <ArrowUpRight size={16} />
          </a>

          <button
            className="text-[#F0F0ED] md:hidden"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle navigation"
          >
            {mobileMenu ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>

        {mobileMenu && (
          <div className="border-t border-[#303239] px-5 py-5 md:hidden">
            <div className="flex flex-col gap-5 text-sm text-[#A7A9B0]">
              <a href="#discover" onClick={() => setMobileMenu(false)}>Discover</a>
              <a href="#upcoming" onClick={() => setMobileMenu(false)}>Release calendar</a>
              <a href="#about" onClick={() => setMobileMenu(false)}>About</a>
            </div>
          </div>
        )}
      </header>

      <main>

        {/* Editorial hero */}
        <section className="border-b border-[#303239]">
          <div className="mx-auto max-w-[1440px] px-5 py-12 md:px-10 md:py-20">

            <div className="mb-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">
              <span className="h-px w-8 bg-[#D7FF64]" />
              The independent gaming journal
            </div>

            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">

              <div>
                <h1 className="max-w-2xl font-[Manrope] text-5xl font-extrabold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[76px]">
                  Games worth
                  <span className="block text-[#D7FF64]">getting lost in.</span>
                </h1>

                <p className="mt-7 max-w-lg text-base leading-8 text-[#A7A9B0] md:text-lg">
                  Discover the next generation of games. Follow upcoming releases,
                  explore independent studios and find your next obsession.
                </p>

                <div className="mt-9 flex flex-wrap gap-3">
                  <a
                    href="#discover"
                    className="inline-flex items-center gap-3 bg-[#D7FF64] px-6 py-4 text-sm font-bold text-[#101114] transition hover:bg-white"
                  >
                    Explore the collection <ArrowUpRight size={17} />
                  </a>

                  <a
                    href="#upcoming"
                    className="inline-flex items-center gap-3 border border-[#45474E] px-6 py-4 text-sm font-semibold transition hover:border-[#D7FF64] hover:text-[#D7FF64]"
                  >
                    Release calendar
                  </a>
                </div>

                <div className="mt-14 flex flex-wrap gap-10 border-t border-[#303239] pt-7">
                  <div>
                    <p className="font-[Manrope] text-3xl font-extrabold tabular-nums">
                      {String(games.length).padStart(2, '0')}
                    </p>
                    <p className="mt-1 text-xs text-[#A7A9B0]">Games featured</p>
                  </div>

                  <div>
                    <p className="font-[Manrope] text-3xl font-extrabold tabular-nums">
                      {String(availableGenres.length).padStart(2, '0')}
                    </p>
                    <p className="mt-1 text-xs text-[#A7A9B0]">Genres explored</p>
                  </div>

                  <div>
                    <p className="font-[Manrope] text-3xl font-extrabold tabular-nums">
                      {String(availablePlatforms.length).padStart(2, '0')}
                    </p>
                    <p className="mt-1 text-xs text-[#A7A9B0]">Platform tags</p>
                  </div>
                </div>
              </div>

              {/* Featured game */}
              <button
                onClick={() => openGame(featuredGame)}
                className="group relative min-h-[360px] overflow-hidden bg-[#191B20] text-left sm:min-h-[470px]"
              >
                {featuredGame.image ? (
                  <img
                    src={featuredGame.image}
                    alt={featuredGame.title}
                    className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#252830]">
                    <Gamepad2 size={64} className="text-[#777A83]" />
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />

                <div className="absolute left-6 top-6 flex items-center gap-2 bg-[#D7FF64] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#101114]">
                  Editor's spotlight
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-9">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">
                    Featured game / {featuredGame.genre}
                  </p>

                  <h2 className="max-w-xl font-[Manrope] text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                    {featuredGame.title}
                  </h2>

                  <p className="mt-3 max-w-md text-sm leading-6 text-white/75">
                    {featuredGame.description}
                  </p>

                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#D7FF64]">
                    Explore the game <ArrowUpRight size={17} />
                  </span>
                </div>
              </button>

            </div>
          </div>
        </section>

        {/* Upcoming releases */}
        <section id="upcoming" className="mx-auto max-w-[1440px] px-5 py-16 md:px-10 md:py-20">

          <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">
                Save the date
              </p>
              <h2 className="mt-3 font-[Manrope] text-3xl font-extrabold tracking-tight md:text-4xl">
                On the horizon
              </h2>
              <p className="mt-2 text-sm text-[#A7A9B0]">
                A look at what's coming next.
              </p>
            </div>

            <a href="#discover" className="flex items-center gap-2 text-sm font-semibold text-[#A7A9B0] transition hover:text-[#D7FF64]">
              All games <ArrowRight size={16} />
            </a>
          </div>

          <div className="border-t border-[#303239]">
            {upcoming.slice(0, 4).map((game, index) => (
              <button
                key={game.id}
                onClick={() => openGame(game)}
                className="group grid w-full grid-cols-[42px_64px_1fr_auto] items-center gap-4 border-b border-[#303239] py-5 text-left transition hover:bg-[#191B20] sm:grid-cols-[50px_90px_1fr_auto_auto] sm:gap-6 sm:px-4"
              >
                <span className="font-[Manrope] text-sm font-bold tabular-nums text-[#777A83]">
                  {String(index + 1).padStart(2, '0')}
                </span>

                {game.image ? (
                  <img
                    src={game.image}
                    alt=""
                    className="h-14 w-16 object-cover sm:h-16 sm:w-24"
                  />
                ) : (
                  <div className="flex h-14 w-16 items-center justify-center bg-[#191B20] sm:h-16 sm:w-24">
                    <Gamepad2 size={23} className="text-[#777A83]" />
                  </div>
                )}

                <div className="min-w-0">
                  <h3 className="truncate font-[Manrope] text-sm font-bold sm:text-base">
                    {game.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#A7A9B0]">
                    {game.developer} · {game.genre}
                  </p>
                  <p className="mt-2 text-xs text-[#D7FF64] sm:hidden">
                    {formatDate(game.date)}
                  </p>
                </div>

                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatDate(game.date)}
                  </p>
                  <p className="mt-1 text-xs text-[#A7A9B0]">
                    {countdown(game.date, tick)}
                  </p>
                </div>

                <ChevronRight className="text-[#777A83] transition group-hover:translate-x-1 group-hover:text-[#D7FF64]" size={20} />
              </button>
            ))}

            {upcoming.length === 0 && (
              <p className="py-10 text-sm text-[#A7A9B0]">
                No upcoming releases found.
              </p>
            )}
          </div>
        </section>

        {/* Game discovery */}
        <section id="discover" className="border-t border-[#303239] bg-[#191B20]">

          <div className="mx-auto max-w-[1440px] px-5 py-16 md:px-10 md:py-20">

            <div className="mb-10">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">
                Find your next favourite
              </p>

              <h2 className="mt-3 font-[Manrope] text-3xl font-extrabold tracking-tight md:text-4xl">
                Explore the collection
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-7 text-[#A7A9B0]">
                Independent worlds, unusual ideas and adventures worth discovering.
              </p>
            </div>

            {/* Search and filters */}
            <div className="mb-8 flex flex-col gap-6">

              <div className="relative max-w-lg">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A7A9B0]" size={19} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search the collection..."
                  className="w-full border border-[#45474E] bg-[#101114] py-4 pl-12 pr-4 text-sm text-[#F0F0ED] outline-none placeholder:text-[#777A83] focus:border-[#D7FF64]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-[#A7A9B0]">
                  Genre
                </span>

                {['All Games', ...availableGenres].map((g) => (
                  <button
                    key={g}
                    onClick={() => setGenre(g)}
                    className={`px-4 py-2 text-xs font-semibold transition ${
                      genre === g
                        ? 'bg-[#D7FF64] text-[#101114]'
                        : 'border border-[#45474E] text-[#A7A9B0] hover:border-[#D7FF64] hover:text-[#D7FF64]'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-[#A7A9B0]">
                  Platform
                </span>

                {['All', ...availablePlatforms].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`border px-3 py-2 text-xs font-semibold transition ${
                      platform === p
                        ? 'border-[#D7FF64] text-[#D7FF64]'
                        : 'border-[#45474E] text-[#A7A9B0] hover:border-[#D7FF64]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

            </div>

            <div className="mb-5 flex items-center justify-between border-b border-[#45474E] pb-4">
              <p className="text-xs text-[#A7A9B0]">
                Showing <span className="font-bold text-[#F0F0ED]">{filtered.length}</span> games
              </p>
              <p className="text-xs uppercase tracking-wider text-[#777A83]">
                Selected collection
              </p>
            </div>

            {/* Game grid */}
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">

              {filtered.map((game) => (
                <article key={game.id} className="group">

                  <button
                    onClick={() => openGame(game)}
                    className="relative block aspect-[16/10] w-full overflow-hidden bg-[#101114] text-left"
                  >
                    {game.image ? (
                      <img
                        src={game.image}
                        alt={game.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#252830]">
                        <Gamepad2 size={48} className="text-[#777A83]" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent opacity-80" />

                    <span className="absolute left-4 top-4 bg-[#101114]/85 px-3 py-2 text-[10px] font-bold uppercase tracking-wider">
                      {game.genre}
                    </span>

                    {game.score !== null && game.score !== undefined && (
                      <span className="absolute right-4 top-4 flex items-center gap-1 bg-[#101114]/85 px-3 py-2 text-xs font-bold text-[#D7FF64]">
                        <Star size={13} fill="currentColor" /> {game.score}
                      </span>
                    )}

                    <span className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center bg-[#D7FF64] text-[#101114] opacity-0 transition group-hover:opacity-100">
                      <ArrowUpRight size={20} />
                    </span>
                  </button>

                  <div className="pt-4">
                    <h3 className="font-[Manrope] text-lg font-bold leading-snug">
                      {game.title}
                    </h3>

                    <p className="mt-2 text-xs text-[#A7A9B0]">
                      {game.developer}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {game.platforms.map((p) => (
                        <span key={p} className="border border-[#45474E] px-2 py-1 text-[10px] font-medium text-[#A7A9B0]">
                          {p}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-[#45474E] pt-4">
                      <span className="text-xs text-[#A7A9B0]">
                        {formatDate(game.date)}
                      </span>

                      <button
                        onClick={() => openGame(game)}
                        className="flex items-center gap-1 text-xs font-bold text-[#D7FF64] transition hover:text-white"
                      >
                        View details <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>

                </article>
              ))}

            </div>

            {filtered.length === 0 && (
              <div className="py-20 text-center">
                <Search className="mx-auto text-[#777A83]" size={32} />
                <p className="mt-4 font-[Manrope] text-lg font-bold">
                  No games found
                </p>
                <p className="mt-2 text-sm text-[#A7A9B0]">
                  Try another search or change your filters.
                </p>
              </div>
            )}

          </div>
        </section>

        {/* About */}
        <section id="about" className="border-t border-[#303239]">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 py-16 md:flex-row md:items-end md:justify-between md:px-10 md:py-20">

            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">
                About GameVault
              </p>

              <h2 className="mt-4 font-[Manrope] text-3xl font-extrabold tracking-tight md:text-4xl">
                Good games deserve to be discovered.
              </h2>

              <p className="mt-5 text-sm leading-7 text-[#A7A9B0]">
                GameVault brings independent games, release tracking and
                community discovery together in one place. Built for players
                who are always looking for their next adventure.
              </p>
            </div>

            <a
              href="#"
              className="inline-flex items-center gap-2 text-sm font-bold text-[#D7FF64] hover:text-white"
            >
              Back to top <ArrowUpRight size={17} />
            </a>

          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-[#303239] bg-[#191B20]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-7 text-xs text-[#A7A9B0] sm:flex-row sm:items-center sm:justify-between md:px-10">
          <span className="font-[Manrope] font-extrabold tracking-wide text-[#F0F0ED]">
            GAME<span className="text-[#D7FF64]">VAULT</span>
          </span>
          <span>© 2026 GameVault. Built for the love of games.</span>
          <span>Discover something different.</span>
        </div>
      </footer>

      {/* Game details modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm"
          onClick={closeGame}
        >
          <div
            className="my-auto w-full max-w-3xl overflow-hidden border border-[#45474E] bg-[#191B20]"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="relative h-56 bg-[#252830] sm:h-72">
              {selected.image && (
                <img
                  src={selected.image}
                  alt={selected.title}
                  className="h-full w-full object-cover"
                />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-[#191B20] to-transparent" />

              <button
                onClick={closeGame}
                aria-label="Close game details"
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center bg-black/70 text-white transition hover:bg-[#D7FF64] hover:text-[#101114]"
              >
                <X size={20} />
              </button>

              <div className="absolute bottom-5 left-6 right-6">
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#D7FF64]">
                  {selected.genre} / Game profile
                </p>
                <h2 className="font-[Manrope] text-2xl font-extrabold sm:text-4xl">
                  {selected.title}
                </h2>
              </div>
            </div>

            <div className="space-y-6 p-6 sm:p-8">

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#A7A9B0]">
                <span>{selected.developer}</span>
                <span>•</span>
                <span>{formatDate(selected.date)}</span>
                <span>•</span>
                <span>{selected.genre}</span>
              </div>

              <p className="text-sm leading-7 text-[#C6C7CA]">
                {selected.description}
              </p>

              <div className="flex flex-wrap gap-2">
                {selected.platforms.map((p) => (
                  <span key={p} className="border border-[#45474E] px-3 py-2 text-xs text-[#A7A9B0]">
                    {p}
                  </span>
                ))}
              </div>

              {selected.website && (
                <a
                  href={selected.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-[#D7FF64] hover:text-white"
                >
                  Official website <ArrowUpRight size={16} />
                </a>
              )}

              {selected.score !== null && selected.score !== undefined && (
                <div className="flex items-center justify-between border-y border-[#45474E] py-5">
                  <div>
                    <p className="text-sm font-bold">Metacritic score</p>
                    <p className="mt-1 text-xs text-[#A7A9B0]">
                      Score provided by Steam game information.
                    </p>
                  </div>

                  <span className="font-[Manrope] text-3xl font-extrabold tabular-nums text-[#D7FF64]">
                    {selected.score}
                  </span>
                </div>
              )}

              {/* Personal excitement slider */}
              <div className="border-y border-[#45474E] py-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold">Your excitement score</p>
                    <p className="mt-1 text-xs text-[#A7A9B0]">
                      How interested are you in this game?
                    </p>
                  </div>

                  <span className="font-[Manrope] text-3xl font-extrabold tabular-nums text-[#D7FF64]">
                    {review}/100
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={review}
                  onChange={(e) => setReview(Number(e.target.value))}
                  className="mt-6 w-full accent-[#D7FF64]"
                />

                <div className="mt-2 flex justify-between text-[10px] text-[#A7A9B0]">
                  <span>Not interested</span>
                  <span>Must play</span>
                </div>

                <p className="mt-4 text-[10px] leading-5 text-[#777A83]">
                  This is your personal interest score. It is not a community rating.
                </p>
              </div>

              <button
                onClick={() => setTrailer(!trailer)}
                className="flex w-full items-center justify-center gap-3 bg-[#D7FF64] py-4 text-sm font-bold text-[#101114] transition hover:bg-white"
              >
                <Play size={17} fill="currentColor" />
                {trailer ? 'Hide trailer preview' : 'Watch trailer'}
              </button>

              {trailer && (
                <div className="border border-[#45474E] bg-[#101114] p-6 text-center">
                  <Play className="mx-auto text-[#D7FF64]" size={28} />
                  <p className="mt-3 text-sm font-semibold">
                    Trailer preview
                  </p>
                  <p className="mt-2 text-xs leading-6 text-[#A7A9B0]">
                    This is a placeholder. An official YouTube trailer URL
                    can be connected here.
                  </p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App

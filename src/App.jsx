import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Gamepad2, Play, Star, X, ChevronRight, ArrowUpRight,
  Menu, ArrowRight, Heart, Library, Bookmark, Loader2, AlertCircle,
  CheckCircle2, CalendarDays, ExternalLink
} from 'lucide-react'

const API_URL = 'http://localhost:3001'
const GENRES = [
  'Action', 'Adventure', 'Strategy', 'RPG', 'Indie',
  'Massively Multiplayer', 'Casual', 'Simulation', 'Racing', 'Sports'
]

function formatDate(value) {
  if (!value) return 'Release date TBA'
  const parsed = Date.parse(value)
  return Number.isNaN(parsed)
    ? value
    : new Date(parsed).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      })
}

function countdown(value) {
  if (!value) return 'Release date TBA'
  const date = Date.parse(value)
  if (Number.isNaN(date)) return 'Release date TBA'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const release = new Date(date)
  release.setHours(0, 0, 0, 0)
  const days = Math.ceil((release - today) / 86400000)
  if (days < 0) return 'Released'
  if (days === 0) return 'Releases today'
  return `${days} days remaining`
}

function getGenre(game) {
  return game.genres?.[0] || 'Discover'
}

function App() {
  const [games, setGames] = useState([]) // Earlier discoveries / catalogue
  const [newlyDiscovered, setNewlyDiscovered] = useState([]) // Most recent run, shown separately
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryError, setDiscoveryError] = useState('')
  const [discoveryGenres, setDiscoveryGenres] = useState(['Action', 'Adventure'])
  const [discoveryLimit, setDiscoveryLimit] = useState(3)
  const [discoveryInfo, setDiscoveryInfo] = useState(null)

  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef(null)
  const discoveryRun = useRef(0)

  const [selected, setSelected] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [saved, setSaved] = useState([])
  const [savingAction, setSavingAction] = useState('')
  const [activeTab, setActiveTab] = useState('discover')
  const [genreFilter, setGenreFilter] = useState('All')
  const [platformFilter, setPlatformFilter] = useState('All')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [tick, setTick] = useState(Date.now())
  const [trailerOpen, setTrailerOpen] = useState(false)

  async function loadSavedActions() {
    try {
      const response = await fetch(`${API_URL}/api/actions`)
      const data = await response.json()
      if (response.ok) setSaved(data.saved || [])
    } catch (error) {
      console.warn('Could not load saved games:', error)
    }
  }

  async function discover(nextGenres = discoveryGenres, nextLimit = discoveryLimit) {
    const runId = ++discoveryRun.current
    const batches = [...new Set(nextGenres)]
    if (!batches.length) {
      setDiscoveryError('Choose at least one genre before starting discovery.')
      return
    }

    // Archive the previous fresh batch into the older catalogue.
    setGames((current) => {
      const merged = new Map(current.map((game) => [game.appid, game]))
      newlyDiscovered.forEach((game) => merged.set(game.appid, game))
      return [...merged.values()]
    })
    setNewlyDiscovered([])
    setDiscovering(true)
    setDiscoveryError('')
    setDiscoveryInfo({ completed: 0, total: batches.length, returned: 0, skipped: 0, refreshedAt: null })

    const collected = new Map()
    const errors = []
    let completed = 0
    let skipped = 0
    let nextIndex = 0

    const sortResults = (items) => [...items].sort((a, b) => {
      const aComing = Boolean(a.comingSoon)
      const bComing = Boolean(b.comingSoon)
      if (aComing !== bComing) return aComing ? 1 : -1
      const aDate = Date.parse(a.date) || 0
      const bDate = Date.parse(b.date) || 0
      return aComing ? aDate - bDate : bDate - aDate
    })

    async function loadGenre(genre) {
      try {
        const params = new URLSearchParams({ genres: genre, limit: String(nextLimit) })
        const response = await fetch(`${API_URL}/api/discover?${params}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || `Could not discover ${genre} games.`)
        if (runId !== discoveryRun.current) return
        for (const game of data.games || []) collected.set(game.appid, game)
        skipped += Number(data.skipped) || 0
      } catch (error) {
        if (runId === discoveryRun.current) errors.push(`${genre}: ${error.message}`)
      } finally {
        if (runId === discoveryRun.current) {
          completed += 1
          const results = sortResults([...collected.values()])
          setNewlyDiscovered(results)
          setDiscoveryInfo({ completed, total: batches.length, returned: results.length, skipped, refreshedAt: new Date().toISOString() })
        }
      }
    }

    async function worker() {
      while (runId === discoveryRun.current) {
        const index = nextIndex++
        if (index >= batches.length) return
        await loadGenre(batches[index])
      }
    }

    try {
      await Promise.all([worker(), worker()])
      if (runId !== discoveryRun.current) return
      if (errors.length) setDiscoveryError(collected.size ? `Some genres could not be loaded: ${errors.join(' · ')}` : errors.join(' · '))
    } finally {
      if (runId === discoveryRun.current) {
        setDiscovering(false)
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    discover(['Action', 'Adventure'], 3)
    loadSavedActions()
    const clock = setInterval(() => setTick(Date.now()), 60000)
    const escape = (event) => {
      if (event.key === 'Escape') {
        setSelected(null)
        setTrailerOpen(false)
        setShowSuggestions(false)
        setMobileMenu(false)
      }
    }
    window.addEventListener('keydown', escape)
    return () => {
      clearInterval(clock)
      window.removeEventListener('keydown', escape)
    }
  }, [])

  // Debounced live autocomplete. It never saves search results.
  useEffect(() => {
    const query = search.trim()
    if (query.length < 2) {
      setSearchResults([])
      setSearching(false)
      setSearchError('')
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      setSearchError('')
      try {
        const response = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Search failed.')
        if (!cancelled) setSearchResults(data.games || [])
      } catch (error) {
        if (!cancelled) setSearchError(error.message)
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  const savedKeys = useMemo(
    () => new Set(saved.map((item) => `${item.appid}:${item.action}`)),
    [saved]
  )

  const genres = useMemo(
    () => [...new Set(games.flatMap((game) => game.genres || []))].sort(),
    [games]
  )

  const platforms = useMemo(
    () => [...new Set(games.flatMap((game) => game.platforms || []))].sort(),
    [games]
  )

  const filteredGames = useMemo(() => games.filter((game) => {
    const matchesGenre = genreFilter === 'All' || game.genres?.includes(genreFilter)
    const matchesPlatform = platformFilter === 'All' || game.platforms?.includes(platformFilter)
    return matchesGenre && matchesPlatform
  }), [games, genreFilter, platformFilter])

  const allDiscoveredGames = useMemo(() => {
    const merged = new Map()
    ;[...newlyDiscovered, ...games].forEach((game) => merged.set(game.appid, game))
    return [...merged.values()]
  }, [newlyDiscovered, games])

  const upcoming = useMemo(() => [...allDiscoveredGames]
    .filter((game) => game.comingSoon || (game.date && Date.parse(game.date) >= Date.now() - 86400000))
    .sort((a, b) => (Date.parse(a.date) || Infinity) - (Date.parse(b.date) || Infinity))
    .slice(0, 5), [allDiscoveredGames, tick])

  const featured = newlyDiscovered[0] || games[0] || null

  async function openGame(game) {
  setSelected(game)
  setDetailsLoading(true)
  setDetailsError('')
  setTrailerOpen(false)

  try {
    const response = await fetch(
      `${API_URL}/api/steam/games/${game.appid}`
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Could not load game details.')
    }

    if (!data.game) {
      throw new Error('Game details were not returned.')
    }

    const details = data.game

    setSelected({
      ...details,
      platforms: Array.isArray(details.platforms)
        ? details.platforms
        : details.platforms && typeof details.platforms === 'object'
          ? Object.entries(details.platforms)
              .filter(([, supported]) => supported)
              .map(([platform]) => platform)
          : [],
      genres: Array.isArray(details.genres) ? details.genres : [],
      screenshots: Array.isArray(details.screenshots)
        ? details.screenshots
        : [],
      movies: Array.isArray(details.movies) ? details.movies : [],
    })
  } catch (error) {
    setDetailsError(error.message || 'Could not load game details.')
  } finally {
    setDetailsLoading(false)
  }
}

  async function toggleAction(action) {
    if (!selected || savingAction) return
    const exists = savedKeys.has(`${selected.appid}:${action}`)
    setSavingAction(action)
    try {
      const response = await fetch(
        exists
          ? `${API_URL}/api/actions/${selected.appid}/${action}`
          : `${API_URL}/api/actions`,
        exists
          ? { method: 'DELETE' }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ appid: selected.appid, source: 'steam', action })
            }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not update your library.')
      await loadSavedActions()
    } catch (error) {
      setDetailsError(error.message)
    } finally {
      setSavingAction('')
    }
  }

  function toggleGenre(item) {
    setDiscoveryGenres((current) =>
      current.includes(item)
        ? current.filter((genre) => genre !== item)
        : [...current, item]
    )
  }

  const navLink = (id, label) => (
    <a href={`#${id}`} onClick={() => setMobileMenu(false)} className="transition hover:text-[#D7FF64]">
      {label}
    </a>
  )

  return (
    <div className="min-h-screen bg-[#101114] text-[#F0F0ED]">
      <header className="sticky top-0 z-40 border-b border-[#303239] bg-[#101114]/95 backdrop-blur-md">
        <nav className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-3 md:px-10">
          <a href="#" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center bg-[#D7FF64] text-[#101114]">
              <Gamepad2 size={23} />
            </span>
            <span className="font-[Manrope] text-xl font-extrabold tracking-tight">
              GAME<span className="text-[#D7FF64]">VAULT</span>
            </span>
          </a>

          <div className="hidden items-center gap-9 text-sm font-medium text-[#A7A9B0] md:flex">
            {navLink('discover', 'Discover')}
            {navLink('upcoming', 'Release calendar')}
            {navLink('my-library', 'My library')}
            {navLink('about', 'About')}
          </div>

          <div className="relative order-3 w-full sm:order-none sm:mx-6 sm:w-auto sm:max-w-xl sm:flex-1" ref={searchRef}>
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#A7A9B0]" />
            <input value={search} onFocus={() => setShowSuggestions(true)} onChange={(event) => { setSearch(event.target.value); setShowSuggestions(true) }} placeholder="Search games on Steam..." aria-label="Search games" className="w-full border border-[#45474E] bg-[#191B20] py-3 pl-11 pr-11 text-sm text-[#F0F0ED] outline-none placeholder:text-[#777A83] focus:border-[#D7FF64]" />
            {search && <button onClick={() => { setSearch(''); setSearchResults([]); setShowSuggestions(false) }} aria-label="Clear search" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A7A9B0] hover:text-white"><X size={17} /></button>}
            {showSuggestions && search.trim().length >= 2 && <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[420px] overflow-y-auto border border-[#45474E] bg-[#101114] shadow-2xl">
              {searching && <div className="flex items-center gap-3 p-5 text-sm text-[#A7A9B0]"><Loader2 size={17} className="animate-spin text-[#D7FF64]" /> Searching Steam...</div>}
              {searchError && <p className="p-5 text-sm text-red-400">{searchError}</p>}
              {!searching && !searchError && searchResults.map((game) => <button key={game.appid} onClick={() => openGame(game)} className="flex w-full items-center gap-4 border-b border-[#303239] p-4 text-left hover:bg-[#191B20]">
                {game.image ? <img src={game.image} alt="" className="h-12 w-20 object-cover" /> : <div className="flex h-12 w-20 items-center justify-center bg-[#191B20]"><Gamepad2 size={20} /></div>}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{game.title}</span><span className="mt-1 block text-xs text-[#A7A9B0]">{game.price || 'Price unavailable'}</span></span><ChevronRight size={18} className="text-[#777A83]" />
              </button>)}
              {!searching && !searchError && !searchResults.length && <p className="p-5 text-sm text-[#A7A9B0]">No matching Steam results.</p>}
            </div>}
          </div>

          <a href="#discover" className="hidden items-center gap-2 bg-[#D7FF64] px-5 py-3 text-sm font-bold text-[#101114] hover:bg-white md:flex">
            Explore games <ArrowUpRight size={16} />
          </a>

          <button className="text-[#F0F0ED] md:hidden" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle navigation">
            {mobileMenu ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>
        {mobileMenu && (
          <div className="border-t border-[#303239] px-5 py-5 md:hidden">
            <div className="flex flex-col gap-5 text-sm text-[#A7A9B0]">
              {navLink('discover', 'Discover')}
              {navLink('upcoming', 'Release calendar')}
              {navLink('my-library', 'My library')}
              {navLink('about', 'About')}
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="border-b border-[#303239]">
          <div className="mx-auto max-w-[1440px] px-5 py-12 md:px-10 md:py-20">
            <div className="mb-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">
              <span className="h-px w-8 bg-[#D7FF64]" />
              The independent gaming journal
            </div>
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <h1 className="max-w-2xl font-[Manrope] text-5xl font-extrabold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[76px]">
                  Games worth <span className="block text-[#D7FF64]">getting lost in.</span>
                </h1>
                <p className="mt-7 max-w-lg text-base leading-8 text-[#A7A9B0] md:text-lg">
                  Discover upcoming releases, explore independent studios and find your next obsession.
                  Live game information, without importing an entire catalogue.
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <a href="#discover" className="inline-flex items-center gap-3 bg-[#D7FF64] px-6 py-4 text-sm font-bold text-[#101114] hover:bg-white">
                    Explore games <ArrowUpRight size={17} />
                  </a>
                  <a href="#upcoming" className="inline-flex items-center gap-3 border border-[#45474E] px-6 py-4 text-sm font-semibold hover:border-[#D7FF64] hover:text-[#D7FF64]">
                    Release calendar
                  </a>
                </div>
                <div className="mt-14 flex flex-wrap gap-10 border-t border-[#303239] pt-7">
                  <div><p className="font-[Manrope] text-3xl font-extrabold tabular-nums">{allDiscoveredGames.length}</p><p className="mt-1 text-xs text-[#A7A9B0]">Games discovered</p></div>
                  <div><p className="font-[Manrope] text-3xl font-extrabold tabular-nums">{genres.length}</p><p className="mt-1 text-xs text-[#A7A9B0]">Genres found</p></div>
                  <div><p className="font-[Manrope] text-3xl font-extrabold tabular-nums">{saved.length}</p><p className="mt-1 text-xs text-[#A7A9B0]">Your saved actions</p></div>
                </div>
              </div>

              <div className="relative min-h-[360px] overflow-hidden bg-[#191B20] sm:min-h-[470px]">
                {featured?.image && <img src={featured.image} alt={featured.title} className="absolute inset-0 h-full w-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                <span className="absolute left-6 top-6 bg-[#D7FF64] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#101114]">Live spotlight</span>
                {featured ? (
                  <button onClick={() => openGame(featured)} className="absolute inset-0 text-left">
                    <div className="absolute bottom-0 p-6 sm:p-9">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">{getGenre(featured)} / Featured discovery</p>
                      <h2 className="max-w-xl font-[Manrope] text-3xl font-extrabold sm:text-4xl">{featured.title}</h2>
                      <p className="mt-3 max-w-md text-sm leading-6 text-white/75">{featured.description}</p>
                      <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#D7FF64]">Explore the game <ArrowUpRight size={17} /></span>
                    </div>
                  </button>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-center">
                    <div><Gamepad2 size={45} className="mx-auto text-[#777A83]" /><p className="mt-4 text-sm text-[#A7A9B0]">Loading live discoveries...</p></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="discover" className="border-b border-[#303239] bg-[#191B20]">
          <div className="mx-auto max-w-[1440px] px-5 py-14 md:px-10 md:py-16">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">Steam live discovery</p>
                <h2 className="mt-3 font-[Manrope] text-3xl font-extrabold tracking-tight md:text-4xl">Find your next game.</h2>
                <p className="mt-4 max-w-lg text-sm leading-7 text-[#A7A9B0]">Choose the genres you want to explore, then run discovery. GameVault checks Steam's upcoming and recently released lists. New results appear in their own section above your earlier discoveries.</p>
                <div className="mt-7 space-y-3 text-xs text-[#A7A9B0]">
                  <p className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center bg-[#D7FF64] font-bold text-[#101114]">1</span> Select one or more genres.</p>
                  <p className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center bg-[#D7FF64] font-bold text-[#101114]">2</span> Choose the result count per Steam feed.</p>
                  <p className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center bg-[#D7FF64] font-bold text-[#101114]">3</span> Press Discover. Results appear as each genre finishes.</p>
                </div>
              </div>
              <div className="border border-[#45474E] bg-[#101114] p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-[Manrope] text-xl font-bold">Discovery controls</h3><p className="mt-1 text-xs text-[#A7A9B0]">These settings apply to your next discovery run.</p></div><span className="border border-[#45474E] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#A7A9B0]">Steam</span></div>
                <div className="mt-7"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-[#A7A9B0]">Genres to search</p><button onClick={() => setDiscoveryGenres(discoveryGenres.length === GENRES.length ? [] : [...GENRES])} className="text-xs font-semibold text-[#D7FF64] hover:text-white">{discoveryGenres.length === GENRES.length ? 'Clear all' : 'Select all'}</button></div>
                  <div className="flex flex-wrap gap-2">{GENRES.map((item) => { const active = discoveryGenres.includes(item); return <button key={item} type="button" aria-pressed={active} onClick={() => toggleGenre(item)} className={`border px-3 py-2.5 text-xs font-semibold transition ${active ? 'border-[#D7FF64] bg-[#D7FF64] text-[#101114]' : 'border-[#45474E] text-[#A7A9B0] hover:border-[#D7FF64] hover:text-[#D7FF64]'}`}>{active ? '✓ ' : '+ '}{item}</button> })}</div>
                  <p className="mt-3 text-xs text-[#777A83]">{discoveryGenres.length} of {GENRES.length} genres selected</p>
                </div>
                <div className="mt-6 grid gap-4 border-t border-[#303239] pt-6 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-bold">Results per Steam feed</p><p className="mt-1 max-w-md text-xs leading-5 text-[#A7A9B0]">For each selected genre: up to this many upcoming games and this many new releases.</p></div>
                  <select value={discoveryLimit} onChange={(event) => setDiscoveryLimit(Number(event.target.value))} className="w-full border border-[#45474E] bg-[#191B20] px-4 py-3 text-sm text-[#F0F0ED] outline-none focus:border-[#D7FF64] sm:w-36"><option value="1">1 per feed</option><option value="3">3 per feed</option><option value="5">5 per feed</option><option value="10">10 per feed</option></select>
                </div>
                <button onClick={() => discover()} disabled={discovering || !discoveryGenres.length} className="mt-6 flex w-full items-center justify-center gap-3 bg-[#D7FF64] px-6 py-4 text-sm font-extrabold text-[#101114] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">{discovering ? <><Loader2 size={18} className="animate-spin" /> Discovering games...</> : <><Search size={18} /> Discover games <ArrowUpRight size={17} /></>}</button>
                {!discoveryGenres.length && <p className="mt-3 text-xs text-amber-300">Select at least one genre to start.</p>}
                {discoveryInfo && <div className="mt-5 border border-[#303239] bg-[#191B20] p-4"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-bold text-[#F0F0ED]">{discovering ? 'Discovery in progress' : 'Last discovery run'}</span><span className="tabular-nums text-[#D7FF64]">{discoveryInfo.completed}/{discoveryInfo.total} genres</span></div><div className="mt-3 h-1.5 overflow-hidden bg-[#303239]"><div className="h-full bg-[#D7FF64] transition-all" style={{ width: `${discoveryInfo.total ? discoveryInfo.completed / discoveryInfo.total * 100 : 0}%` }} /></div><p className="mt-3 text-xs leading-5 text-[#A7A9B0]">{discoveryInfo.returned} unique games found · {discoveryInfo.skipped} unavailable listings skipped{discoveryInfo.refreshedAt && !discovering ? ` · Finished ${new Date(discoveryInfo.refreshedAt).toLocaleTimeString()}` : ''}</p></div>}
                {discoveryError && <div className="mt-4 flex gap-3 border border-red-500/30 p-4"><AlertCircle size={19} className="shrink-0 text-red-400" /><p className="text-xs leading-5 text-red-300">{discoveryError}</p></div>}
              </div>
            </div>
          </div>
        </section>

        <section id="new-discoveries" className="mx-auto max-w-[1440px] px-5 py-16 md:px-10 md:py-20">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">Fresh from Steam</p><h2 className="mt-3 font-[Manrope] text-3xl font-extrabold md:text-4xl">Just discovered</h2><p className="mt-2 text-sm text-[#A7A9B0]">Results from your latest discovery run. They stay separate from earlier batches below.</p></div><span className="border border-[#45474E] px-3 py-2 text-xs text-[#A7A9B0]">{newlyDiscovered.length} new results</span></div>
          {newlyDiscovered.length ? <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{newlyDiscovered.map((game) => <article key={game.appid} className="group"><button onClick={() => openGame(game)} className="relative block aspect-[16/10] w-full overflow-hidden bg-[#191B20] text-left">{game.image ? <img src={game.image} alt={game.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" /> : <div className="flex h-full items-center justify-center"><Gamepad2 size={48} className="text-[#777A83]" /></div>}<div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /><span className="absolute left-4 top-4 bg-[#D7FF64] px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-[#101114]">{game.comingSoon ? 'Coming soon' : 'Recently released'}</span>{game.score != null && <span className="absolute right-4 top-4 bg-[#101114]/85 px-3 py-2 text-xs font-bold text-[#D7FF64]"><Star size={12} className="mr-1 inline" fill="currentColor" />{game.score}</span>}</button><div className="pt-4"><h3 className="font-[Manrope] text-lg font-bold leading-snug">{game.title}</h3><p className="mt-2 text-xs text-[#A7A9B0]">{game.developer || 'Developer not listed'} · {getGenre(game)}</p><div className="mt-3 flex flex-wrap gap-2">{(game.platforms || []).map((item) => <span key={item} className="border border-[#45474E] px-2 py-1 text-[10px] text-[#A7A9B0]">{item}</span>)}</div><div className="mt-4 flex items-center justify-between border-t border-[#45474E] pt-4"><span className="text-xs text-[#A7A9B0]">{formatDate(game.date)}</span><button onClick={() => openGame(game)} className="flex items-center gap-1 text-xs font-bold text-[#D7FF64] hover:text-white">Details <ChevronRight size={15} /></button></div></div></article>)}</div> : <div className="border border-dashed border-[#45474E] bg-[#191B20] px-6 py-12 text-center">{discovering ? <Loader2 size={26} className="mx-auto animate-spin text-[#D7FF64]" /> : <Search size={26} className="mx-auto text-[#777A83]" />}<p className="mt-4 font-[Manrope] text-lg font-bold">{discovering ? 'Finding games for you...' : 'No fresh discoveries yet'}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#A7A9B0]">Choose your genres above and press Discover games. New results will appear here first.</p></div>}
        </section>

        <section id="upcoming" className="mx-auto max-w-[1440px] px-5 py-16 md:px-10 md:py-20">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">Save the date</p><h2 className="mt-3 font-[Manrope] text-3xl font-extrabold md:text-4xl">On the horizon</h2><p className="mt-2 text-sm text-[#A7A9B0]">Upcoming releases from the live discovery feed.</p></div>
            <a href="#discover" className="flex items-center gap-2 text-sm font-semibold text-[#A7A9B0] hover:text-[#D7FF64]">Explore all <ArrowRight size={16} /></a>
          </div>
          <div className="border-t border-[#303239]">
            {upcoming.map((game, index) => (
              <button key={game.appid} onClick={() => openGame(game)} className="group grid w-full grid-cols-[30px_64px_1fr_auto] items-center gap-4 border-b border-[#303239] py-5 text-left hover:bg-[#191B20] sm:grid-cols-[50px_90px_1fr_auto_auto] sm:gap-6 sm:px-4">
                <span className="font-[Manrope] text-sm font-bold tabular-nums text-[#777A83]">{String(index + 1).padStart(2, '0')}</span>
                {game.image ? <img src={game.image} alt="" className="h-14 w-16 object-cover sm:h-16 sm:w-24" /> : <div className="flex h-14 w-16 items-center justify-center bg-[#191B20]"><Gamepad2 size={22} /></div>}
                <div className="min-w-0"><h3 className="truncate font-[Manrope] text-sm font-bold sm:text-base">{game.title}</h3><p className="mt-1 text-xs text-[#A7A9B0]">{game.developer} · {getGenre(game)}</p><p className="mt-2 text-xs text-[#D7FF64] sm:hidden">{formatDate(game.date)}</p></div>
                <div className="hidden text-right sm:block"><p className="text-sm font-semibold">{formatDate(game.date)}</p><p className="mt-1 text-xs text-[#A7A9B0]">{countdown(game.date)}</p></div>
                <ChevronRight size={20} className="text-[#777A83] group-hover:text-[#D7FF64]" />
              </button>
            ))}
            {!upcoming.length && <p className="py-10 text-sm text-[#A7A9B0]">{loading ? 'Loading releases...' : 'No upcoming release dates in this discovery batch.'}</p>}
          </div>
        </section>

        <section className="border-t border-[#303239] bg-[#191B20]">
          <div className="mx-auto max-w-[1440px] px-5 py-16 md:px-10 md:py-20">
            <div className="mb-9"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">Find your next favourite</p><h2 className="mt-3 font-[Manrope] text-3xl font-extrabold md:text-4xl">Your game catalogue</h2><p className="mt-3 max-w-xl text-sm leading-7 text-[#A7A9B0]">Earlier discovery batches live here. Search Steam from the header; opening a result never saves it.</p></div>



            <div className="mt-10 flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#45474E] pb-5">
                <div><h3 className="font-[Manrope] text-xl font-bold">Earlier discoveries</h3><p className="mt-1 text-xs text-[#A7A9B0]">Previous discovery batches. Fresh results stay in the section above.</p></div>
                <div className="flex flex-wrap gap-2">
                  <select value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)} className="border border-[#45474E] bg-[#101114] px-3 py-2 text-xs text-[#F0F0ED]"><option value="All">All genres</option>{genres.map((item) => <option key={item}>{item}</option>)}</select>
                  <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="border border-[#45474E] bg-[#101114] px-3 py-2 text-xs text-[#F0F0ED]"><option value="All">All platforms</option>{platforms.map((item) => <option key={item}>{item}</option>)}</select>
                </div>
              </div>
              {loading && <div className="flex items-center gap-3 py-12 text-sm text-[#A7A9B0]"><Loader2 className="animate-spin text-[#D7FF64]" /> Loading live discoveries...</div>}
              {!loading && discoveryError && !games.length && <p className="py-10 text-sm text-red-400">{discoveryError}</p>}
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {filteredGames.map((game) => (
                  <article key={game.appid} className="group">
                    <button onClick={() => openGame(game)} className="relative block aspect-[16/10] w-full overflow-hidden bg-[#101114] text-left">
                      {game.image ? <img src={game.image} alt={game.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" /> : <div className="flex h-full items-center justify-center"><Gamepad2 size={48} className="text-[#777A83]" /></div>}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" />
                      <span className="absolute left-4 top-4 bg-[#101114]/85 px-3 py-2 text-[10px] font-bold uppercase tracking-wider">{getGenre(game)}</span>
                      {game.score != null && <span className="absolute right-4 top-4 flex items-center gap-1 bg-[#101114]/85 px-3 py-2 text-xs font-bold text-[#D7FF64]"><Star size={13} fill="currentColor" />{game.score}</span>}
                      <span className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center bg-[#D7FF64] text-[#101114] opacity-0 transition group-hover:opacity-100"><ArrowUpRight size={20} /></span>
                    </button>
                    <div className="pt-4"><h3 className="font-[Manrope] text-lg font-bold leading-snug">{game.title}</h3><p className="mt-2 text-xs text-[#A7A9B0]">{game.developer}</p><div className="mt-4 flex flex-wrap gap-2">{(game.platforms || []).map((item) => <span key={item} className="border border-[#45474E] px-2 py-1 text-[10px] text-[#A7A9B0]">{item}</span>)}</div><div className="mt-5 flex items-center justify-between border-t border-[#45474E] pt-4"><span className="text-xs text-[#A7A9B0]">{game.price}</span><button onClick={() => openGame(game)} className="flex items-center gap-1 text-xs font-bold text-[#D7FF64] hover:text-white">View details <ChevronRight size={15} /></button></div></div>
                  </article>
                ))}
              </div>
              {!loading && !filteredGames.length && <p className="py-12 text-center text-sm text-[#A7A9B0]">No earlier discovery batches yet. Your newest results are shown in Just discovered above.</p>}
            </div>
          </div>
        </section>

        <section id="my-library" className="border-t border-[#303239]">
          <div className="mx-auto max-w-[1440px] px-5 py-16 md:px-10 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">Your personal space</p>
            <h2 className="mt-3 font-[Manrope] text-3xl font-extrabold md:text-4xl">My library</h2>
            <p className="mt-3 text-sm text-[#A7A9B0]">Only games you've deliberately saved appear here.</p>
            <div className="mt-7 flex flex-wrap gap-2">
              {[['discover', 'Discover'], ['favorite', 'Favourites'], ['vault', 'My Vault'], ['wishlist', 'Wishlist']].map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-3 text-xs font-bold ${activeTab === tab ? 'bg-[#D7FF64] text-[#101114]' : 'border border-[#45474E] text-[#A7A9B0] hover:border-[#D7FF64]'}`}>{label}</button>
              ))}
            </div>
            {activeTab !== 'discover' && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {saved.filter((item) => item.action === activeTab).map((item) => (
                  <button key={`${item.appid}-${item.action}`} onClick={() => item.game && openGame(item.game)} className="flex items-center gap-4 border border-[#303239] bg-[#191B20] p-4 text-left hover:border-[#D7FF64]">
                    {item.game?.image ? <img src={item.game.image} alt="" className="h-16 w-28 object-cover" /> : <div className="flex h-16 w-28 items-center justify-center bg-[#101114]"><Gamepad2 /></div>}
                    <span className="min-w-0"><span className="block truncate text-sm font-bold">{item.game?.title || `Steam App ${item.appid}`}</span><span className="mt-1 block text-xs capitalize text-[#A7A9B0]">{item.action}</span></span>
                  </button>
                ))}
                {!saved.some((item) => item.action === activeTab) && <p className="text-sm text-[#A7A9B0]">Nothing saved here yet. Explore games and add the ones you like.</p>}
              </div>
            )}
            {activeTab === 'discover' && <p className="mt-6 text-sm text-[#A7A9B0]">Browse games above. Open any game to favourite it, add it to your Vault or put it on your Wishlist.</p>}
          </div>
        </section>

        <section id="about" className="border-t border-[#303239]">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 py-16 md:flex-row md:items-end md:justify-between md:px-10 md:py-20">
            <div className="max-w-xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D7FF64]">About GameVault</p><h2 className="mt-4 font-[Manrope] text-3xl font-extrabold md:text-4xl">Good games deserve to be discovered.</h2><p className="mt-5 text-sm leading-7 text-[#A7A9B0]">GameVault brings game discovery, release tracking and a personal library together. Browse freely. Save only what matters to you.</p></div>
            <a href="#" className="inline-flex items-center gap-2 text-sm font-bold text-[#D7FF64] hover:text-white">Back to top <ArrowUpRight size={17} /></a>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#303239] bg-[#191B20]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-7 text-xs text-[#A7A9B0] sm:flex-row sm:items-center sm:justify-between md:px-10">
          <span className="font-[Manrope] font-extrabold tracking-wide text-[#F0F0ED]">GAME<span className="text-[#D7FF64]">VAULT</span></span>
          <span>© 2026 GameVault. Built for the love of games.</span><span>Discover something different.</span>
        </div>
      </footer>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="my-auto w-full max-w-4xl overflow-hidden border border-[#45474E] bg-[#191B20]" onClick={(event) => event.stopPropagation()}>
            <div className="relative h-56 bg-[#252830] sm:h-72">
              {selected.image && <img src={selected.image} alt={selected.title} className="h-full w-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-[#191B20] to-transparent" />
              <button onClick={() => setSelected(null)} aria-label="Close details" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center bg-black/70 text-white hover:bg-[#D7FF64] hover:text-[#101114]"><X size={20} /></button>
              <div className="absolute bottom-5 left-6 right-6"><p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#D7FF64]">{getGenre(selected)} / Game profile</p><h2 className="font-[Manrope] text-2xl font-extrabold sm:text-4xl">{selected.title}</h2></div>
            </div>

            <div className="space-y-6 p-6 sm:p-8">
              {detailsLoading && <p className="flex items-center gap-2 text-xs text-[#A7A9B0]"><Loader2 size={15} className="animate-spin" /> Loading full Steam details...</p>}
              {detailsError && <p className="text-xs text-red-400">{detailsError}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#A7A9B0]"><span>{selected.developer || 'Developer unknown'}</span><span>•</span><span>{formatDate(selected.date)}</span><span>•</span><span>{getGenre(selected)}</span></div>
              <p className="text-sm leading-7 text-[#C6C7CA]">{selected.description || 'No description available.'}</p>
              <div className="flex flex-wrap gap-2">{(selected.platforms || []).map((item) => <span key={item} className="border border-[#45474E] px-3 py-2 text-xs text-[#A7A9B0]">{item}</span>)}</div>

              <div className="grid gap-4 border-y border-[#45474E] py-5 sm:grid-cols-3">
                <div><p className="text-[10px] uppercase tracking-wider text-[#A7A9B0]">Current Steam price</p><p className="mt-2 font-[Manrope] text-xl font-extrabold text-[#D7FF64]">{selected.price || 'Price unavailable'}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-[#A7A9B0]">Release date</p><p className="mt-2 text-sm font-bold">{formatDate(selected.date)}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-[#A7A9B0]">Metacritic</p><p className="mt-2 text-sm font-bold">{selected.score ?? 'Not rated'}</p></div>
              </div>

              <div>
                <p className="mb-3 text-sm font-bold">Add to your personal library</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ['favorite', 'Favourite', Heart],
                    ['vault', 'Add to Vault', Library],
                    ['wishlist', 'Wishlist', Bookmark]
                  ].map(([action, label, Icon]) => {
                    const isSaved = savedKeys.has(`${selected.appid}:${action}`)
                    return <button key={action} onClick={() => toggleAction(action)} disabled={Boolean(savingAction)} className={`flex items-center justify-center gap-2 border px-4 py-3 text-xs font-bold transition ${isSaved ? 'border-[#D7FF64] bg-[#D7FF64]/10 text-[#D7FF64]' : 'border-[#45474E] text-[#F0F0ED] hover:border-[#D7FF64] hover:text-[#D7FF64]'}`}>
                      {savingAction === action ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
                      {isSaved ? `Saved: ${label}` : label}
                    </button>
                  })}
                </div>
              </div>

              {selected.movies?.length > 0 && (
                <div>
                  <button onClick={() => setTrailerOpen(!trailerOpen)} className="flex w-full items-center justify-center gap-3 bg-[#D7FF64] py-4 text-sm font-bold text-[#101114] hover:bg-white"><Play size={17} fill="currentColor" />{trailerOpen ? 'Hide trailer' : 'Watch official trailer'}</button>
                  {trailerOpen && <video controls autoPlay className="mt-4 w-full bg-black" poster={selected.movies[0].thumbnail}><source src={selected.movies[0].mp4 || selected.movies[0].webm} type={selected.movies[0].mp4 ? 'video/mp4' : 'video/webm'} />Your browser does not support this video.</video>}
                </div>
              )}

              {selected.screenshots?.length > 0 && <div><p className="mb-3 text-sm font-bold">Screenshots</p><div className="grid grid-cols-2 gap-3">{selected.screenshots.slice(0, 4).map((src) => <img key={src} src={src} alt={`${selected.title} screenshot`} className="aspect-video w-full object-cover" />)}</div></div>}

              {selected.website && <a href={selected.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-[#D7FF64] hover:text-white">Official website <ExternalLink size={15} /></a>}
              <a href={selected.storeUrl || `https://store.steampowered.com/app/${selected.appid}/`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 border border-[#45474E] py-3 text-xs font-bold hover:border-[#D7FF64] hover:text-[#D7FF64]">Open Steam store page <ArrowUpRight size={15} /></a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

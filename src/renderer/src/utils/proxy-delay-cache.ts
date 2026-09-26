interface CachedProxyDelay {
  delay: number
  time: number
}

const STORAGE_KEY = 'proxyDelayCache'
export const PROXY_DELAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000

let cache: Record<string, CachedProxyDelay> = readCache()
let saveTimer: ReturnType<typeof setTimeout> | null = null

function readCache(): Record<string, CachedProxyDelay> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, CachedProxyDelay>
  } catch {
    return {}
  }
}

function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch {
      // 写不进去（配额、隐私模式）就不记忆，功能降级但不影响测速
    }
  }, 500)
}

export function rememberProxyDelay(name: string, delay: number): void {
  const previous = cache[name]
  if (previous && previous.delay === delay && Date.now() - previous.time < 60_000) return

  cache[name] = { delay, time: Date.now() }
  scheduleSave()
}

// 返回超过 TTL 的旧结果时视为没测过，避免拿几天前的延迟误导
export function getCachedProxyDelay(name: string): number | undefined {
  const entry = cache[name]
  if (!entry) return undefined
  if (Date.now() - entry.time > PROXY_DELAY_CACHE_TTL_MS) return undefined
  return entry.delay
}

export function clearCachedProxyDelays(): void {
  cache = {}
  scheduleSave()
}

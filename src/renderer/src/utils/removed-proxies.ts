const STORAGE_KEY = 'removedTimeoutProxies'

// 不同订阅的节点名会撞车，所以名单按配置（订阅）id 分开存。
// clearedAt 是上次手动更新订阅的时间，比它更早的测速记录不再算数（节点都换新了）
interface RemovedProxyEntry {
  names: string[]
  clearedAt: number
}

type RemovedProxyStore = Record<string, RemovedProxyEntry>

export interface RemovedProxyState {
  names: ReadonlySet<string>
  clearedAt: number
}

const EMPTY_STATE: RemovedProxyState = { names: new Set<string>(), clearedAt: 0 }

let store: RemovedProxyStore | undefined
let revision = 0
const listeners = new Set<() => void>()
const snapshotCache = new Map<string, { revision: number; state: RemovedProxyState }>()

function normalizeEntry(value: unknown): RemovedProxyEntry | undefined {
  // 旧版本存的是纯字符串数组，读出来补一个 clearedAt
  if (Array.isArray(value)) {
    return { names: toNames(value), clearedAt: 0 }
  }
  if (!value || typeof value !== 'object') return undefined
  const entry = value as Partial<RemovedProxyEntry>
  return {
    names: toNames(entry.names),
    clearedAt:
      typeof entry.clearedAt === 'number' && Number.isFinite(entry.clearedAt) ? entry.clearedAt : 0
  }
}

function toNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((name): name is string => typeof name === 'string')
}

function readStore(): RemovedProxyStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const next: RemovedProxyStore = {}
    Object.entries(parsed as Record<string, unknown>).forEach(([profileId, value]) => {
      const entry = normalizeEntry(value)
      if (!entry) return
      if (entry.names.length === 0 && entry.clearedAt === 0) return
      next[profileId] = entry
    })
    return next
  } catch {
    return {}
  }
}

function getStore(): RemovedProxyStore {
  if (store === undefined) store = readStore()
  return store
}

function commit(): void {
  revision += 1
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getStore()))
  } catch {
    // 写不进去（配额、隐私模式）就只在本次运行里生效，不影响测速
  }
  listeners.forEach((listener) => listener())
}

export function subscribeRemovedProxies(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// 同一版本内保持同一个引用，配合 useSyncExternalStore 用
export function getRemovedProxyState(profileId: string): RemovedProxyState {
  const cached = snapshotCache.get(profileId)
  if (cached && cached.revision === revision) return cached.state
  const entry = getStore()[profileId]
  const state: RemovedProxyState = entry
    ? { names: new Set(entry.names), clearedAt: entry.clearedAt }
    : EMPTY_STATE
  snapshotCache.set(profileId, { revision, state })
  return state
}

export function addRemovedProxies(profileId: string, names: readonly string[]): void {
  if (names.length === 0) return
  const current = getStore()
  const entry = current[profileId] ?? { names: [], clearedAt: 0 }
  const merged = new Set(entry.names)
  let changed = false
  names.forEach((name) => {
    if (merged.has(name)) return
    merged.add(name)
    changed = true
  })
  if (!changed) return
  current[profileId] = { names: [...merged], clearedAt: entry.clearedAt }
  commit()
}

// 手动更新订阅：名单清空，同时记下时间，更新前的测速记录不再算数
export function clearRemovedProxies(profileId: string): void {
  const current = getStore()
  current[profileId] = { names: [], clearedAt: Date.now() }
  commit()
}

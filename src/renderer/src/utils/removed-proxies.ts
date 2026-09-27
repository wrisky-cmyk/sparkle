const STORAGE_KEY = 'removedTimeoutProxies'

// 不同订阅的节点名会撞车，所以名单按配置（订阅）id 分开存
type RemovedProxyStore = Record<string, string[]>

function readStore(): RemovedProxyStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as RemovedProxyStore
  } catch {
    return {}
  }
}

function writeStore(store: RemovedProxyStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // 写不进去（配额、隐私模式）就只在本次运行里生效，不影响测速
  }
}

export function loadRemovedProxies(profileId: string): Set<string> {
  const names = readStore()[profileId]
  return Array.isArray(names) ? new Set(names) : new Set()
}

export function saveRemovedProxies(profileId: string, names: Set<string>): void {
  const store = readStore()
  if (names.size === 0) {
    delete store[profileId]
  } else {
    store[profileId] = [...names]
  }
  writeStore(store)
}

export function clearRemovedProxies(profileId: string): void {
  const store = readStore()
  if (!(profileId in store)) return
  delete store[profileId]
  writeStore(store)
}

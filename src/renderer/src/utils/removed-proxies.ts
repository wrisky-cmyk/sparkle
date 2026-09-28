import type { ProxyTestProfileResult, ProxyTestStore } from '../../../shared/proxy-test'
import { getProxyTestStore, setProxyTestStore } from '@renderer/utils/ipc'

// 测速结果（超时名单 + 已测名单）由主进程持有，这里只是内存镜像：
// 一致性问题交给单一数据源解决，渲染进程不再往 localStorage 另存一份。
// 名单只由页面上真正发起的测速结果决定（超时的加进来、通的去掉），不扫 mihomo 的
// history，免得 url-test 组的后台健康检查把节点顺手删掉。
const EMPTY_NAMES: ReadonlySet<string> = new Set<string>()
const EMPTY_RESULT: ProxyTestProfileResult = { removed: [], tested: [] }
// v1 版本在 localStorage 里另存过一份超时名单，首次加载时搬到主进程
const LEGACY_STORAGE_KEY = 'removedTimeoutProxies2'

let store: ProxyTestStore = {}
let loaded = false
let loadPromise: Promise<boolean> | undefined
let revision = 0
const listeners = new Set<() => void>()
const removedCache = new Map<string, { revision: number; names: ReadonlySet<string> }>()
const testedCache = new Map<string, { revision: number; names: ReadonlySet<string> }>()

function readLegacyStore(): ProxyTestStore {
  const legacy: ProxyTestStore = {}
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return legacy
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return legacy
    Object.entries(parsed as Record<string, unknown>).forEach(([profileId, names]) => {
      if (!Array.isArray(names)) return
      const removed = names.filter((name): name is string => typeof name === 'string' && name.length > 0)
      if (removed.length === 0) return
      legacy[profileId] = { removed, tested: [] }
    })
  } catch {
    return legacy
  }
  return legacy
}

function ensureLoaded(): Promise<boolean> {
  if (loaded) return Promise.resolve(true)
  loadPromise ??= getProxyTestStore()
    .then((value) => {
      store = value && typeof value === 'object' ? value : {}
      let migrated = false
      const legacy = readLegacyStore()
      Object.entries(legacy).forEach(([profileId, item]) => {
        if (store[profileId]?.removed?.length) return
        store[profileId] = { removed: item.removed, tested: store[profileId]?.tested ?? [] }
        migrated = true
      })
      if (migrated) {
        void setProxyTestStore(store)
          .then(() => {
            try {
              localStorage.removeItem(LEGACY_STORAGE_KEY)
            } catch {
              // 删不掉也无所谓，下次迁移会被主进程里的名单挡住
            }
          })
          .catch(() => {})
      }
      loaded = true
      revision += 1
      removedCache.clear()
      testedCache.clear()
      listeners.forEach((listener) => listener())
      return true
    })
    .catch(() => {
      // 读不到就什么都不写，免得把主进程的名单覆盖成空
      loadPromise = undefined
      return false
    })
  return loadPromise
}

function commit(): void {
  revision += 1
  removedCache.clear()
  testedCache.clear()
  // 主进程写完会重新生成配置并热重载，失败也不影响页面显示
  void setProxyTestStore(store).catch(() => {})
  listeners.forEach((listener) => listener())
}

function resultOf(profileId: string): ProxyTestProfileResult {
  const current = store[profileId]
  if (!current) return EMPTY_RESULT
  return {
    removed: Array.isArray(current.removed) ? current.removed : [],
    tested: Array.isArray(current.tested) ? current.tested : []
  }
}

function mutate(
  profileId: string,
  update: (current: ProxyTestProfileResult) => ProxyTestProfileResult | undefined
): void {
  if (!profileId) return
  void ensureLoaded().then((ok) => {
    if (!ok) return
    const next = update(resultOf(profileId))
    if (!next) return
    if (next.removed.length === 0 && next.tested.length === 0) {
      delete store[profileId]
    } else {
      store = { ...store, [profileId]: next }
    }
    commit()
  })
}

function mergeNames(current: readonly string[], names: readonly string[]): string[] | undefined {
  const merged = new Set(current)
  let changed = false
  names.forEach((name) => {
    if (typeof name !== 'string' || name.length === 0 || merged.has(name)) return
    merged.add(name)
    changed = true
  })
  return changed ? [...merged] : undefined
}

function snapshotOf(
  cache: Map<string, { revision: number; names: ReadonlySet<string> }>,
  profileId: string,
  names: string[]
): ReadonlySet<string> {
  const cached = cache.get(profileId)
  if (cached && cached.revision === revision) return cached.names
  const snapshot = names.length > 0 ? new Set(names) : EMPTY_NAMES
  cache.set(profileId, { revision, names: snapshot })
  return snapshot
}

export function subscribeRemovedProxies(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// 同一版本内保持同一个引用，配合 useSyncExternalStore 用
export function getRemovedProxyNames(profileId: string): ReadonlySet<string> {
  return snapshotOf(removedCache, profileId, resultOf(profileId).removed)
}

export function getTestedProxyNames(profileId: string): ReadonlySet<string> {
  return snapshotOf(testedCache, profileId, resultOf(profileId).tested)
}

export function addRemovedProxies(profileId: string, names: readonly string[]): void {
  if (names.length === 0) return
  mutate(profileId, (current) => {
    const removed = mergeNames(current.removed, names)
    if (!removed) return undefined
    return { removed, tested: current.tested }
  })
}

// 测通的从名单里去掉：名单是「上一次测速的结果」，通了的自然不该再算超时
export function removeRemovedProxies(profileId: string, names: readonly string[]): void {
  if (names.length === 0) return
  mutate(profileId, (current) => {
    if (current.removed.length === 0) return undefined
    const recovered = new Set(names)
    const removed = current.removed.filter((name) => !recovered.has(name))
    if (removed.length === current.removed.length) return undefined
    return { removed, tested: current.tested }
  })
}

export function addTestedProxies(profileId: string, names: readonly string[]): void {
  if (names.length === 0) return
  mutate(profileId, (current) => {
    const tested = mergeNames(current.tested, names)
    if (!tested) return undefined
    return { removed: current.removed, tested }
  })
}

// 自动测速会拿到当前订阅的完整节点名单，用它替换已测名单，顺带清掉订阅里已经不存在
// 的旧名字，免得名单无限增长
export function replaceTestedProxies(profileId: string, names: readonly string[]): void {
  if (names.length === 0) return
  mutate(profileId, (current) => {
    const tested = [...new Set(names)]
    const unchanged =
      tested.length === current.tested.length && tested.every((name, i) => name === current.tested[i])
    if (unchanged) return undefined
    return { removed: current.removed, tested }
  })
}

void ensureLoaded()

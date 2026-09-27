import { setExcludedProxies } from '@renderer/utils/ipc'

// v1 的名单可能混进整组误判（核心刚重启时全超时）的记录，换 key 让旧数据作废
const STORAGE_KEY = 'removedTimeoutProxies2'

// 不同订阅的节点名会撞车，所以名单按配置（订阅）id 分开存。
// 名单只由页面上真正发起的测速结果决定（超时的加进来），不扫 mihomo 的 history，
// 免得 url-test 组的后台健康检查把节点顺手删掉。
type RemovedProxyStore = Record<string, string[]>

let store: RemovedProxyStore | undefined
let revision = 0
const listeners = new Set<() => void>()
const snapshotCache = new Map<string, { revision: number; names: ReadonlySet<string> }>()
const EMPTY_NAMES: ReadonlySet<string> = new Set<string>()

function readStore(): RemovedProxyStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const next: RemovedProxyStore = {}
    Object.entries(parsed as Record<string, unknown>).forEach(([profileId, value]) => {
      if (!Array.isArray(value)) return
      const names = value.filter((name): name is string => typeof name === 'string')
      if (names.length === 0) return
      next[profileId] = names
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
export function getRemovedProxyNames(profileId: string): ReadonlySet<string> {
  const cached = snapshotCache.get(profileId)
  if (cached && cached.revision === revision) return cached.names
  const names = getStore()[profileId]
  const state = names && names.length > 0 ? new Set(names) : EMPTY_NAMES
  snapshotCache.set(profileId, { revision, names: state })
  return state
}

export function addRemovedProxies(profileId: string, names: readonly string[]): void {
  if (names.length === 0) return
  const current = getStore()
  const merged = new Set(current[profileId] ?? [])
  let changed = false
  names.forEach((name) => {
    if (merged.has(name)) return
    merged.add(name)
    changed = true
  })
  if (!changed) return
  current[profileId] = [...merged]
  commit()
}

// 测通的从名单里去掉：名单是「上一次测速的结果」，通了的自然不该再算超时
export function removeRemovedProxies(profileId: string, names: readonly string[]): void {
  if (names.length === 0) return
  const current = getStore()
  const existing = current[profileId]
  if (!existing || existing.length === 0) return
  const recovered = new Set(names)
  const kept = existing.filter((name) => !recovered.has(name))
  if (kept.length === existing.length) return
  if (kept.length === 0) {
    delete current[profileId]
  } else {
    current[profileId] = kept
  }
  commit()
}

// 名单不随订阅更新或切换系统代理清空：更新后新出现的节点（不在名单里的）照常显示，
// 之前测出超时的节点继续隐藏，不用再白测一轮

// 同步给主进程：它生成核心配置时会把名单里的节点从各代理组去掉，
// 自动选择组就不会再去健康检查或选中它们。开关关掉时推空名单，等于全部放回来。
export function syncExcludedProxies(enabled: boolean): void {
  void setExcludedProxies(enabled ? getStore() : {}).catch(() => {
    // 通知失败不影响页面显示
  })
}

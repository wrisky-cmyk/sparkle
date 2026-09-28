import { readFile, writeFile } from 'fs/promises'
import { proxyTestStorePath } from '../utils/dirs'
import { getAppConfig } from './app'
import type { ProxyTestProfileResult, ProxyTestStore } from '../../shared/proxy-test'

// 代理页测速的结果，按订阅 id 存一份，生成核心配置时用上：
// - removed：最近一次测速超时的节点，从各代理组的 proxies 里去掉（providers 组用 exclude-filter），
//   这样自动选择组不会再拿它们做健康检查、也不会选到它们；
// - tested：最近一次测速拿到结果的节点名，更新订阅后自动测速只补测没测过的。
let store: ProxyTestStore | undefined

function normalizeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const names = new Set<string>()
  value.forEach((name) => {
    if (typeof name !== 'string' || name.length === 0) return
    names.add(name)
  })
  return [...names]
}

function sanitizeProfile(value: unknown): ProxyTestProfileResult | undefined {
  // v1 只有超时名单（字符串数组），v2 起带上 tested
  const source = Array.isArray(value) ? { removed: value, tested: [] } : value
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined
  const item = source as Record<string, unknown>
  const removed = normalizeNames(item.removed)
  const tested = normalizeNames(item.tested)
  if (removed.length === 0 && tested.length === 0) return undefined
  return { removed, tested }
}

function sanitize(value: unknown): ProxyTestStore {
  const next: ProxyTestStore = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next
  Object.entries(value as Record<string, unknown>).forEach(([profileId, item]) => {
    const sanitized = sanitizeProfile(item)
    if (sanitized) next[profileId] = sanitized
  })
  return next
}

async function readStore(): Promise<ProxyTestStore> {
  try {
    return sanitize(JSON.parse(await readFile(proxyTestStorePath(), 'utf-8')))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    return {}
  }
}

export async function getProxyTestStore(): Promise<ProxyTestStore> {
  if (!store) store = await readStore()
  return store
}

export async function setProxyTestStore(value: unknown): Promise<void> {
  store = sanitize(value)
  await writeFile(proxyTestStorePath(), JSON.stringify(store), 'utf-8')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function applyExcludedProxies(
  profile: Partial<MihomoConfig>,
  profileId: string | undefined
): Promise<void> {
  if (!profileId) return
  // 开关状态只认 app config，渲染进程不用再推送「空名单」来关掉排除
  const { removeTimeoutProxies = false } = await getAppConfig()
  if (!removeTimeoutProxies) return

  const names = (await getProxyTestStore())[profileId]?.removed
  if (!names || names.length === 0) return
  const groups = profile['proxy-groups']
  if (!Array.isArray(groups)) return

  const excluded = new Set(names)
  const pattern = names.map((name) => `^${escapeRegExp(name)}$`).join('|')

  groups.forEach((group) => {
    if (!group || typeof group !== 'object') return
    const item = group as Record<string, unknown>
    const proxies = item.proxies
    if (Array.isArray(proxies) && proxies.length > 0) {
      const kept = proxies.filter((name) => typeof name !== 'string' || !excluded.has(name))
      // 组不能清空，不然引用它的规则会失效，这种就保持原样
      if (kept.length > 0) item.proxies = kept
    }
    // 从 proxy-providers / include-all 拉节点的组，只有 exclude-filter 管用
    const current = typeof item['exclude-filter'] === 'string' ? item['exclude-filter'] : ''
    item['exclude-filter'] = current ? `${current}|${pattern}` : pattern
  })
}

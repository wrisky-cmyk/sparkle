import { readFile, writeFile } from 'fs/promises'
import { excludedProxiesPath } from '../utils/dirs'

// 代理页测速后删掉的超时节点名，按订阅 id 存一份，生成核心配置时用上：
// 把这些名字从各代理组的 proxies 里去掉（走 providers 的组用 exclude-filter），
// 这样自动选择组不会再拿它们做健康检查、也不会选到它们。
type ExcludedProxyStore = Record<string, string[]>

let store: ExcludedProxyStore | undefined

function sanitize(value: unknown): ExcludedProxyStore {
  const next: ExcludedProxyStore = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next
  Object.entries(value as Record<string, unknown>).forEach(([profileId, names]) => {
    if (!Array.isArray(names)) return
    const filtered = names.filter(
      (name): name is string => typeof name === 'string' && name.length > 0
    )
    if (filtered.length > 0) next[profileId] = filtered
  })
  return next
}

async function readStore(): Promise<ExcludedProxyStore> {
  try {
    return sanitize(JSON.parse(await readFile(excludedProxiesPath(), 'utf-8')))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    return {}
  }
}

export async function getExcludedProxyStore(): Promise<ExcludedProxyStore> {
  if (!store) store = await readStore()
  return store
}

export async function setExcludedProxyStore(value: unknown): Promise<void> {
  store = sanitize(value)
  await writeFile(excludedProxiesPath(), JSON.stringify(store), 'utf-8')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function applyExcludedProxies(
  profile: Partial<MihomoConfig>,
  profileId: string | undefined
): Promise<void> {
  if (!profileId) return
  const names = (await getExcludedProxyStore())[profileId]
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

import { readFile, writeFile, rename, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { proxyTestStorePath } from '../utils/dirs'
import { appendAppLog } from '../utils/log'
import { getAppConfig } from './app'
import type { ProxyTestProfileResult, ProxyTestStore } from '../../shared/proxy-test'

// 代理页测速的结果，按订阅 id 存一份，生成核心配置时用上：
// - removed：最近一次测速超时的节点，从各代理组的 proxies 里去掉（providers 组用 exclude-filter），
//   这样自动选择组不会再拿它们做健康检查、也不会选到它们；
// - tested：最近一次测速拿到结果的节点名，更新订阅后自动测速只补测没测过的。
let store: ProxyTestStore | undefined
// 测速过程中渲染进程会连续推送名单，多次写入必须排队并原子落盘：
// 并发 writeFile 会各自 truncate 再按自己的偏移写，短内容写在长内容之后就会留下
// 「完整 JSON + 上一次的残尾」，之后 JSON.parse 永远失败
let writePromise: Promise<void> = Promise.resolve()

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
  const storePath = proxyTestStorePath()
  let raw: string
  try {
    raw = await readFile(storePath, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    return {}
  }
  try {
    return sanitize(JSON.parse(raw))
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e
    // 名单损坏不能拖垮配置生成，留档后从空名单重建
    const backupPath = `${storePath}.corrupt-${Date.now()}`
    try {
      await rename(storePath, backupPath)
      void appendAppLog(`[ProxyTest]: parse store failed, moved to ${backupPath}, ${e}\n`).catch(
        () => {}
      )
    } catch (renameError) {
      void appendAppLog(
        `[ProxyTest]: parse store failed and backup failed, ${e}; ${renameError}\n`
      ).catch(() => {})
    }
    return {}
  }
}

export async function getProxyTestStore(): Promise<ProxyTestStore> {
  if (!store) store = await readStore()
  return store
}

export async function setProxyTestStore(value: unknown): Promise<void> {
  store = sanitize(value)
  const content = JSON.stringify(store)
  const previousPromise = writePromise
  const currentPromise = (async () => {
    await previousPromise
    await writeStore(content)
  })()
  writePromise = currentPromise.catch(() => {})
  await currentPromise
}

async function writeStore(content: string): Promise<void> {
  const storePath = proxyTestStorePath()
  const tmpPath = `${storePath}.tmp`
  try {
    await writeFile(tmpPath, content, 'utf-8')
    if (existsSync(storePath) && process.platform === 'win32') {
      await unlink(storePath)
    }
    await rename(tmpPath, storePath)
  } catch (e) {
    try {
      await unlink(tmpPath)
    } catch {
      // ignore
    }
    throw e
  }
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

import { readFile, writeFile } from 'fs/promises'
import { trayIconCachePath } from '../utils/dirs'
import type { TrayIconCache } from '../../shared/tray-icon-cache'

// 「按状态自动着色」生成的两张 PNG 属于派生产物：只缓存，不进 app config，
// 免得备份/同步里塞两个 base64，也免得每次打开设置页都重写一遍配置文件。
// base 与两个颜色一起存，用来判断缓存是不是还对得上当前的输入。
let cache: TrayIconCache | undefined
let loaded = false
const listeners = new Set<(cache: TrayIconCache) => void>()

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function sanitize(value: unknown): TrayIconCache | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const item = value as Record<string, unknown>
  const sysProxy = readString(item.sysProxy)
  const tun = readString(item.tun)
  if (!sysProxy && !tun) return undefined
  return {
    base: readString(item.base),
    sysProxyColor: readString(item.sysProxyColor),
    tunColor: readString(item.tunColor),
    ...(sysProxy ? { sysProxy } : {}),
    ...(tun ? { tun } : {}),
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0
  }
}

export async function getTrayIconCache(): Promise<TrayIconCache | undefined> {
  if (loaded) return cache
  loaded = true
  try {
    cache = sanitize(JSON.parse(await readFile(trayIconCachePath(), 'utf-8')))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    cache = undefined
  }
  return cache
}

export async function setTrayIconCache(value: unknown): Promise<void> {
  const next = sanitize(value)
  cache = next
  loaded = true
  if (!next) {
    await writeFile(trayIconCachePath(), '{}', 'utf-8')
    return
  }
  const stored: TrayIconCache = { ...next, updatedAt: Date.now() }
  cache = stored
  await writeFile(trayIconCachePath(), JSON.stringify(stored), 'utf-8')
  listeners.forEach((listener) => listener(stored))
}

export function subscribeTrayIconCache(listener: (cache: TrayIconCache) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

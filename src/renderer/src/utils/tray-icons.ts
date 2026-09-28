import type { TrayIconCacheInput } from '../../../shared/tray-icon-cache'
import {
  resolveTrayIconSource,
  resolveTrayIconState,
  type TrayIconSources,
  type TrayIconState
} from '../../../shared/tray-icon'
import defaultTrayIcon from '../../../../resources/icon.png'
import {
  getTrayIconCache,
  readImageFileDataURL,
  setTrayIconCache
} from '@renderer/utils/ipc'
import { loadImageElement, recolorImageElementToPngDataURL } from '@renderer/utils/image'

// 「按状态自动着色」的图标在渲染进程算（canvas 在这边），算完只推给主进程做缓存，
// 不写进 app config；托盘本身、macOS 的网速合成图都从这里取。
export interface TrayIconTintInput extends TrayIconSources {
  sysProxyEnabled: boolean
  tunEnabled: boolean
  autoTint: boolean
  sysProxyColor: string
  tunColor: string
}

let lastPushedKey = ''
let cacheLoadPromise: Promise<TrayIconCacheInput | undefined> | undefined
const tintedCache = new Map<string, Promise<string | undefined>>()

function hexToRgbColor(hex: string): { red: number; green: number; blue: number } | undefined {
  const normalized = hex.trim().replace(/^#/, '')
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) return undefined
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  return {
    red: parseInt(full.slice(0, 2), 16),
    green: parseInt(full.slice(2, 4), 16),
    blue: parseInt(full.slice(4, 6), 16)
  }
}

async function toDataURL(icon: string): Promise<string> {
  if (!icon) return defaultTrayIcon
  if (icon.startsWith('data:image/')) return icon
  return await readImageFileDataURL(icon)
}

function cacheKeyOf(input: { base: string; sysProxyColor: string; tunColor: string }): string {
  return `${input.base}|${input.sysProxyColor}|${input.tunColor}`
}

// 生成某个状态的着色图标；带上 memo，网速合成图每帧都可能用
function tintedIcon(
  state: Exclude<TrayIconState, 'default'>,
  base: string,
  color: string
): Promise<string | undefined> {
  const key = `${state}|${base}|${color}`
  const cached = tintedCache.get(key)
  if (cached) return cached
  const task = (async () => {
    const rgbColor = hexToRgbColor(color)
    if (!rgbColor) return undefined
    try {
      const image = await loadImageElement(await toDataURL(base))
      return recolorImageElementToPngDataURL(image, rgbColor)
    } catch {
      return undefined
    }
  })()
  tintedCache.set(key, task)
  return task
}

/**
 * 算出系统代理 / 虚拟网卡两个状态的着色图标并推给主进程缓存。
 * 输入没变（含重启后缓存已经对得上）就直接跳过，不再重复计算和写盘。
 */
export async function syncTrayIconCache(input: {
  base: string
  sysProxyColor: string
  tunColor: string
}): Promise<void> {
  const key = cacheKeyOf(input)
  if (!lastPushedKey) {
    cacheLoadPromise ??= getTrayIconCache().catch(() => undefined)
    const existing = await cacheLoadPromise
    if (existing && cacheKeyOf(existing) === key) {
      lastPushedKey = key
      return
    }
  }
  if (lastPushedKey === key) return

  const [sysProxy, tun] = await Promise.all([
    tintedIcon('sysproxy', input.base, input.sysProxyColor),
    tintedIcon('tun', input.base, input.tunColor)
  ])
  if (!sysProxy || !tun) return

  lastPushedKey = key
  await setTrayIconCache({ ...input, sysProxy, tun })
}

/**
 * 托盘合成图（macOS 显示网速时）用的图标：自动着色走着色版，否则用手动图标。
 * 没设置自定义图标时返回空串，调用方沿用默认模板图标。
 */
export async function getActiveTrayIconDataURL(input: TrayIconTintInput): Promise<string> {
  const state = resolveTrayIconState(input.sysProxyEnabled, input.tunEnabled)
  if (input.autoTint && state !== 'default') {
    const color = state === 'tun' ? input.tunColor : input.sysProxyColor
    const tinted = await tintedIcon(state, input.customTrayIcon ?? '', color)
    if (tinted) return tinted
  }
  const source = resolveTrayIconSource(input, state)
  return source
}

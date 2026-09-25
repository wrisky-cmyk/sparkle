export type TrayIconState = 'default' | 'sysproxy' | 'tun'

export interface TrayIconSources {
  customTrayIcon?: string
  customTrayIconSysProxy?: string
  customTrayIconTun?: string
}

// 虚拟网卡优先于系统代理，两者都未开启时使用默认图标
export function resolveTrayIconState(sysProxyEnabled: boolean, tunEnabled: boolean): TrayIconState {
  if (tunEnabled) return 'tun'
  if (sysProxyEnabled) return 'sysproxy'
  return 'default'
}

export function resolveTrayIconSource(sources: TrayIconSources, state: TrayIconState): string {
  const { customTrayIcon = '', customTrayIconSysProxy = '', customTrayIconTun = '' } = sources

  if (state === 'tun') return customTrayIconTun || customTrayIcon
  if (state === 'sysproxy') return customTrayIconSysProxy || customTrayIcon
  return customTrayIcon
}

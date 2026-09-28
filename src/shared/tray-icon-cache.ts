// 「按状态自动着色」的派生产物只做缓存，不进 app config
export interface TrayIconCacheInput {
  // 生成着色图标用的基础图标（空串表示内置图标）
  base: string
  sysProxyColor: string
  tunColor: string
  sysProxy?: string
  tun?: string
}

export interface TrayIconCache extends TrayIconCacheInput {
  updatedAt: number
}

import {
  SPEED_TEST_GROUP_PREFIX,
  SPEED_TEST_LISTENER_PREFIX,
  SPEED_TEST_SLOT_COUNT,
  speedTestGroupName,
  speedTestListenerName,
  speedTestPort
} from '../../shared/speed-test'

export function applySpeedTestConfig(profile: Partial<MihomoConfig>): void {
  const raw = profile as Record<string, unknown>
  const groups = Array.isArray(raw['proxy-groups'])
    ? (raw['proxy-groups'] as Record<string, unknown>[])
    : []
  const listeners = Array.isArray(raw.listeners)
    ? (raw.listeners as Record<string, unknown>[])
    : []

  const filteredGroups = groups.filter(
    (group) =>
      typeof group?.name !== 'string' || !group.name.startsWith(SPEED_TEST_GROUP_PREFIX)
  )
  const filteredListeners = listeners.filter(
    (listener) =>
      typeof listener?.name !== 'string' ||
      !listener.name.startsWith(SPEED_TEST_LISTENER_PREFIX)
  )

  const proxyNames = [
    ...new Set(
      (Array.isArray(raw.proxies) ? raw.proxies : [])
        .map((proxy) =>
          proxy && typeof proxy === 'object' && 'name' in proxy
            ? (proxy as { name?: unknown }).name
            : undefined
        )
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
    )
  ]
  const providerNames = Object.keys(
    (raw['proxy-providers'] as Record<string, unknown> | undefined) || {}
  )

  if (proxyNames.length > 0 || providerNames.length > 0) {
    for (let index = 0; index < SPEED_TEST_SLOT_COUNT; index += 1) {
      const groupName = speedTestGroupName(index)
      const group: Record<string, unknown> = {
        name: groupName,
        type: 'select',
        hidden: true
      }
      if (proxyNames.length > 0) group.proxies = proxyNames
      if (providerNames.length > 0) group.use = providerNames
      filteredGroups.push(group)
      filteredListeners.push({
        name: speedTestListenerName(index),
        type: 'mixed',
        port: speedTestPort(index),
        listen: '127.0.0.1',
        proxy: groupName
      })
    }
  }

  raw['proxy-groups'] = filteredGroups
  raw.listeners = filteredListeners
}

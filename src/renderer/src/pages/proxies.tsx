import { Chip, Button, Spinner, Card, Avatar } from '@heroui/react'
import { Pressable } from 'react-aria'

import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  getImageDataURL,
  mihomoChangeProxy,
  mihomoCloseConnections,
  mihomoGroups,
  mihomoGroupDelay,
  mihomoProxyDelay
} from '@renderer/utils/ipc'
import { FaLocationCrosshairs } from 'react-icons/fa6'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react'
import { GroupedVirtuoso, GroupedVirtuosoHandle } from 'react-virtuoso'
import ProxyItem from '@renderer/components/proxies/proxy-item'
import ProxySettingDrawer from '@renderer/components/proxies/proxy-setting-drawer'
import { IoIosArrowBack } from 'react-icons/io'
import { MdDoubleArrow, MdOutlineSpeed, MdTune } from 'react-icons/md'
import { useGroups } from '@renderer/hooks/use-groups'
import CollapseInput from '@renderer/components/base/collapse-input'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { runDelayTestsWithConcurrency } from '@renderer/utils/delay-test'
import { notify } from '@renderer/utils/notification'
import { subscribeProfileUpdated, takeProfileUpdated } from '@renderer/utils/profile-updated'
import {
  addRemovedProxies,
  getRemovedProxyNames,
  removeRemovedProxies,
  syncExcludedProxies,
  subscribeRemovedProxies
} from '@renderer/utils/removed-proxies'

type ProxyLike = ControllerProxiesDetail | ControllerGroupDetail

const EMPTY_PROXIES: ProxyLike[] = []

function getProxyDelay(proxy: ProxyLike): number {
  return proxy.history.length > 0 ? proxy.history[proxy.history.length - 1].delay : -1
}

function compareProxyDelay(a: ProxyLike, b: ProxyLike): number {
  const delayA = getProxyDelay(a)
  const delayB = getProxyDelay(b)
  if (delayA === -1) return -1
  if (delayB === -1) return 1
  if (delayA === 0) return 1
  if (delayB === 0) return -1
  return delayA - delayB
}

function getProxyDelayRank(proxy: ProxyLike): number {
  const delay = getProxyDelay(proxy)
  if (delay > 0) return 0
  return delay === -1 ? 1 : 2
}

function getProviderName(proxy: ProxyLike): string | undefined {
  return 'provider-name' in proxy ? proxy['provider-name'] : undefined
}

interface GroupHeaderProps {
  index: number
  group: ControllerMixedGroup
  isOpen: boolean
  isLast: boolean
  groupDisplayLayout: 'hidden' | 'single' | 'double'
  searchValue: string
  delaying: boolean
  onToggle: (index: number, currentlyOpen: boolean) => void
  onUpdateSearch: (index: number, value: string) => void
  onScrollToProxy: (index: number) => void
  onGroupDelay: (index: number) => void
}

const GroupHeader = memo(function GroupHeader({
  index,
  group,
  isOpen,
  isLast,
  groupDisplayLayout,
  searchValue,
  delaying,
  onToggle,
  onUpdateSearch,
  onScrollToProxy,
  onGroupDelay
}: GroupHeaderProps) {
  return (
    <div className={`w-full pt-2 ${isLast && !isOpen ? 'pb-2' : ''} px-2`}>
      <Pressable onPress={() => onToggle(index, isOpen)}>
        <Card className="w-full" data-pressable="true" role="button" tabIndex={0}>
          <Card.Content
            className={`h-14 w-full overflow-hidden py-2 pr-3 ${group.icon ? 'pl-2' : 'pl-3'}`}
          >
            <div className="flex h-full min-h-0 justify-between">
              <div className="flex h-full min-w-0 items-center overflow-hidden whitespace-nowrap">
                {group.icon ? (
                  <Avatar
                    className="mr-3 h-10 w-10 shrink-0 bg-transparent overflow-visible! rounded-none!"
                    size="md"
                  >
                    <Avatar.Image
                      className="object-contain"
                      src={
                        group.icon.startsWith('<svg')
                          ? `data:image/svg+xml;utf8,${group.icon}`
                          : localStorage.getItem(group.icon) || group.icon
                      }
                    />
                  </Avatar>
                ) : null}
                <div className="flex min-w-0 flex-col justify-center">
                  <div
                    className={`truncate ${groupDisplayLayout === 'double' ? 'text-md leading-5' : 'text-lg leading-tight'}`}
                  >
                    <span className="flag-emoji inline-block">{group.name}</span>
                    {groupDisplayLayout === 'single' && (
                      <>
                        <div className="inline ml-2 text-sm text-foreground-500">{group.type}</div>
                        <div className="inline flag-emoji ml-2 text-sm text-foreground-500">
                          {group.now}
                        </div>
                      </>
                    )}
                  </div>
                  {groupDisplayLayout === 'double' && (
                    <div className="truncate text-[10px] leading-4 text-foreground-500">
                      <span>{group.type}</span>
                      <span className="flag-emoji ml-1 inline-block">{group.now}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <div
                  className="flex items-center"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Chip
                    size="sm"
                    data-color="default"
                    variant="primary"
                    className={['my-1 mr-2'].filter(Boolean).join(' ')}
                  >
                    <Chip.Label>{group.all.length}</Chip.Label>
                  </Chip>
                  <CollapseInput
                    value={searchValue}
                    onValueChange={(v) => onUpdateSearch(index, v)}
                  />
                  <Button
                    size="sm"
                    isIconOnly
                    onPress={() => onScrollToProxy(index)}
                    variant="ghost"
                    data-color="default"
                  >
                    <FaLocationCrosshairs className="text-lg text-foreground-500" />
                  </Button>
                  <Button
                    size="sm"
                    isIconOnly
                    onPress={() => onGroupDelay(index)}
                    variant="ghost"
                    data-color="default"
                    isPending={delaying}
                    isDisabled={delaying}
                  >
                    {delaying ? (
                      <Spinner size="sm" color="current" />
                    ) : (
                      <MdOutlineSpeed className="text-lg text-foreground-500" />
                    )}
                  </Button>
                </div>
                <IoIosArrowBack
                  className={`transition duration-200 ml-2 h-8 text-lg text-foreground-500 flex items-center ${isOpen ? '-rotate-90' : ''}`}
                />
              </div>
            </div>
          </Card.Content>
        </Card>
      </Pressable>
    </div>
  )
})

interface ProxyGroupPageCache {
  isOpen: Record<string, boolean>
  searchValue: Record<string, string>
  scrollTop: number
}

const proxyGroupPageCache: ProxyGroupPageCache = {
  isOpen: {},
  searchValue: {},
  scrollTop: 0
}

const Proxies: React.FC = () => {
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { mode = 'rule' } = controledMihomoConfig || {}
  const { groups = [], mutate } = useGroups()
  const { profileConfig } = useProfileConfig()
  const { appConfig } = useAppConfig()
  const {
    proxyDisplayLayout = 'double',
    groupDisplayLayout = 'double',
    showGroupSelectedProxy = false,
    showProxyDetailTooltip = false,
    proxyDisplayOrder = 'default',
    removeTimeoutProxies = false,
    autoCloseConnection = true,
    closeMode = 'all',
    proxyCols = 'auto',
    delayTestUrlScope = 'group',
    delayTestUseGroupApi = false,
    delayTestConcurrency,
    rememberProxyGroupOpenState = false
  } = appConfig || {}
  const [cols, setCols] = useState(1)
  const [isOpen, setIsOpen] = useState<boolean[]>(() => {
    if (
      rememberProxyGroupOpenState &&
      groups.length > 0 &&
      Object.keys(proxyGroupPageCache.isOpen).length > 0
    ) {
      return groups.map((group) => proxyGroupPageCache.isOpen[group.name] ?? false)
    }
    return Array(groups.length).fill(false)
  })
  const [isOpenContent, setIsOpenContent] = useState<boolean[]>(isOpen)
  const isOpenContentRef = useRef<boolean[]>(isOpen)
  isOpenContentRef.current = isOpenContent
  const [delaying, setDelaying] = useState(Array(groups.length).fill(false))
  // 每个订阅一份「测速超时被删掉」名单，记在本地；更新订阅/切换代理都不清，
  // 更新后新出现的节点自然会显示出来
  const profileId = profileConfig?.current ?? ''
  const removedProxies = useSyncExternalStore(subscribeRemovedProxies, () =>
    getRemovedProxyNames(profileId)
  )
  // 名单变化或开关切换时同步给主进程，由它在下一次生成核心配置时排除这些节点
  useEffect(() => {
    syncExcludedProxies(removeTimeoutProxies)
  }, [removeTimeoutProxies, removedProxies])
  const [searchValue, setSearchValue] = useState<string[]>(() => {
    if (
      rememberProxyGroupOpenState &&
      groups.length > 0 &&
      Object.keys(proxyGroupPageCache.searchValue).length > 0
    ) {
      return groups.map((group) => proxyGroupPageCache.searchValue[group.name] ?? '')
    }
    return Array(groups.length).fill('')
  })
  const [isSettingDrawerOpen, setIsSettingDrawerOpen] = useState(false)
  const [settingDrawerReopenSignal, setSettingDrawerReopenSignal] = useState(0)
  const [initialScrollTop] = useState(() =>
    rememberProxyGroupOpenState ? proxyGroupPageCache.scrollTop : 0
  )
  const virtuosoRef = useRef<GroupedVirtuosoHandle>(null)
  const pendingScrollRef = useRef<number | null>(null)
  const scrollerElRef = useRef<HTMLElement | null>(null)
  const rememberProxyGroupOpenStateRef = useRef(rememberProxyGroupOpenState)
  rememberProxyGroupOpenStateRef.current = rememberProxyGroupOpenState
  const previousGroupsRef = useRef(groups)

  const scrollerRef = useCallback((el: Window | HTMLElement | null) => {
    if (scrollerElRef.current) {
      if (rememberProxyGroupOpenStateRef.current && scrollerElRef.current.isConnected) {
        proxyGroupPageCache.scrollTop = scrollerElRef.current.scrollTop
      }
      scrollerElRef.current.onscroll = null
    }
    scrollerElRef.current = el instanceof HTMLElement ? el : null
    if (scrollerElRef.current) {
      const htmlEl = scrollerElRef.current
      htmlEl.onscroll = () => {
        if (rememberProxyGroupOpenStateRef.current) {
          proxyGroupPageCache.scrollTop = htmlEl.scrollTop
        }
      }
    }
  }, [])

  useLayoutEffect(() => {
    const previousGroups = previousGroupsRef.current
    previousGroupsRef.current = groups
    if (
      previousGroups.length === groups.length &&
      previousGroups.every((group, index) => group.name === groups[index].name)
    ) {
      return
    }

    const remapByGroupName = <T,>(
      prev: T[],
      getFallback: (group: ControllerMixedGroup) => T
    ): T[] => {
      const previousValues = new Map(
        previousGroups.map((group, index) => [group.name, prev[index]] as const)
      )
      return groups.map((group) => previousValues.get(group.name) ?? getFallback(group))
    }

    const getOpenFallback = (group: ControllerMixedGroup): boolean =>
      rememberProxyGroupOpenStateRef.current
        ? (proxyGroupPageCache.isOpen[group.name] ?? false)
        : false
    setIsOpen((prev) => remapByGroupName(prev, getOpenFallback))
    setIsOpenContent((prev) => remapByGroupName(prev, getOpenFallback))
    setSearchValue((prev) =>
      remapByGroupName(prev, (group) =>
        rememberProxyGroupOpenStateRef.current
          ? (proxyGroupPageCache.searchValue[group.name] ?? '')
          : ''
      )
    )
    setDelaying((prev) => remapByGroupName(prev, () => false))
  }, [groups])

  const { groupCounts, allProxies } = useMemo(() => {
    const groupCounts: number[] = []
    const allProxies: ProxyLike[][] = []
    groups.forEach((group, index) => {
      if (isOpenContent[index]) {
        const searchText = searchValue[index] || ''
        let groupProxies = searchText
          ? group.all.filter((proxy) => proxy && includesIgnoreCase(proxy.name, searchText))
          : (group.all as ProxyLike[])

        if (removeTimeoutProxies) {
          groupProxies = groupProxies.filter((proxy) => !removedProxies.has(proxy.name))
        }
        if (proxyDisplayOrder === 'delay') {
          groupProxies = [...groupProxies].sort(compareProxyDelay)
        }
        if (proxyDisplayOrder === 'name') {
          groupProxies = [...groupProxies].sort((a, b) => a.name.localeCompare(b.name))
        }
        if (removeTimeoutProxies) {
          // 测通的排最前，没测过的次之；组内保持上面选定的排序（sort 稳定）
          groupProxies = [...groupProxies].sort(
            (a, b) => getProxyDelayRank(a) - getProxyDelayRank(b)
          )
        }

        groupCounts.push(Math.ceil(groupProxies.length / cols))
        allProxies.push(groupProxies)
      } else {
        groupCounts.push(0)
        allProxies.push(EMPTY_PROXIES)
      }
    })
    return { groupCounts, allProxies }
  }, [
    groups,
    isOpenContent,
    proxyDisplayOrder,
    removeTimeoutProxies,
    removedProxies,
    cols,
    searchValue
  ])

  const onChangeProxy = useCallback(
    async (group: string, proxy: string): Promise<void> => {
      await mihomoChangeProxy(group, proxy)
      if (autoCloseConnection) {
        if (closeMode === 'all') {
          await mihomoCloseConnections()
        } else if (closeMode === 'group') {
          await mihomoCloseConnections(group)
        }
      }
      mutate()
    },
    [autoCloseConnection, closeMode, mutate]
  )

  const getDelayTestUrl = useCallback(
    (group?: ControllerMixedGroup): string | undefined => {
      if (delayTestUrlScope === 'global') return undefined
      return group?.testUrl
    },
    [delayTestUrlScope]
  )

  // 名单就是「上一次测速的结果」：只记页面上真正测出来的结果（不扫 mihomo 的
  // history，否则 url-test 的后台健康检查也会把节点删掉），超时的加进来、通的去掉。
  // 开关只管这份名单用不用（隐藏 + 从核心配置里排除），记录本身一直更新。
  const recordTimeoutProxies = useCallback(
    (names: readonly string[]): void => {
      if (names.length === 0) return
      addRemovedProxies(profileId, names)
    },
    [profileId]
  )

  const recordRecoveredProxies = useCallback(
    (names: readonly string[]): void => {
      if (names.length === 0) return
      removeRemovedProxies(profileId, names)
    },
    [profileId]
  )

  // 更新订阅后自动测一遍：把各组的节点去重后统一测，不再靠手点
  const autoTestingRef = useRef(false)
  const runAutoDelayTest = useCallback(async (): Promise<void> => {
    if (autoTestingRef.current) return
    autoTestingRef.current = true
    try {
      const freshGroups = await mihomoGroups().catch(() => groups)
      const targets: { proxy: ProxyLike; url?: string }[] = []
      const seen = new Set<string>()
      freshGroups.forEach((group) => {
        group.all.forEach((proxy) => {
          if (!proxy || seen.has(proxy.name) || removedProxies.has(proxy.name)) return
          seen.add(proxy.name)
          targets.push({ proxy, url: getDelayTestUrl(group) })
        })
      })
      if (targets.length === 0) return

      const timeoutNames: string[] = []
      const okNames: string[] = []
      await runDelayTestsWithConcurrency(targets, delayTestConcurrency, async (target) => {
        try {
          await mihomoProxyDelay(target.proxy.name, target.url, getProviderName(target.proxy))
          okNames.push(target.proxy.name)
        } catch {
          timeoutNames.push(target.proxy.name)
        }
      })

      if (timeoutNames.length >= targets.length) {
        // 一个都没通，多半是测速地址或网络的问题，不删
        notify('自动测速全部超时，未删除节点（请检查网络或测速地址）', { variant: 'warning' })
      } else {
        recordTimeoutProxies(timeoutNames)
        recordRecoveredProxies(okNames)
        if (timeoutNames.length > 0) {
          notify(`自动测速完成，隐藏 ${timeoutNames.length} 个超时节点`, { variant: 'success' })
        }
      }
      mutate()
    } catch (e) {
      notify(e, { variant: 'danger' })
    } finally {
      autoTestingRef.current = false
    }
  }, [
    groups,
    removedProxies,
    delayTestConcurrency,
    getDelayTestUrl,
    recordTimeoutProxies,
    recordRecoveredProxies,
    mutate
  ])

  // 更新订阅后自动测一遍（开关关着就不测，名单本来也不生效）
  const [autoTestPending, setAutoTestPending] = useState(false)
  useEffect(() => {
    const onProfileUpdated = (): void => setAutoTestPending(true)
    if (takeProfileUpdated()) setAutoTestPending(true)
    return subscribeProfileUpdated(onProfileUpdated)
  }, [])
  useEffect(() => {
    if (!autoTestPending) return
    if (!removeTimeoutProxies) {
      setAutoTestPending(false)
      return
    }
    // 等核心重启完、节点列表刷新出来；groups 每次更新都会把这个计时器往后推
    const timer = setTimeout(() => {
      setAutoTestPending(false)
      void runAutoDelayTest()
    }, 2500)
    return () => clearTimeout(timer)
  }, [autoTestPending, removeTimeoutProxies, groups, runAutoDelayTest])

  const onProxyDelay = useCallback(
    async (proxy: ProxyLike, group?: ControllerMixedGroup): Promise<ControllerProxiesDelay> => {
      try {
        const result = await mihomoProxyDelay(
          proxy.name,
          getDelayTestUrl(group),
          getProviderName(proxy)
        )
        recordRecoveredProxies([proxy.name])
        return result
      } catch (e) {
        recordTimeoutProxies([proxy.name])
        throw e
      }
    },
    [getDelayTestUrl, recordTimeoutProxies, recordRecoveredProxies]
  )

  const setGroupDelaying = useCallback((index: number, value: boolean): void => {
    setDelaying((prev) => {
      const newDelaying = [...prev]
      newDelaying[index] = value
      return newDelaying
    })
  }, [])

  const onGroupDelay = useCallback(
    async (index: number): Promise<void> => {
      const group = groups[index]
      if (!group) return

      const openedProxies = allProxies[index] || EMPTY_PROXIES
      const candidates = openedProxies.length > 0 ? openedProxies : (group.all as ProxyLike[])
      // 已删掉的超时节点不再重测，省得整组测速每次都干等一轮超时
      const proxies = removeTimeoutProxies
        ? candidates.filter((proxy) => !removedProxies.has(proxy.name))
        : candidates
      if (proxies.length === 0) return

      if (openedProxies.length === 0) {
        if (rememberProxyGroupOpenStateRef.current) {
          proxyGroupPageCache.isOpen[group.name] = true
        }
        setIsOpen((prev) => {
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
        setTimeout(() => {
          setIsOpenContent((prev) => {
            const newOpen = [...prev]
            newOpen[index] = true
            return newOpen
          })
        }, 0)
      }

      const testUrl = getDelayTestUrl(group)
      setGroupDelaying(index, true)

      // 整组测下来一个都没通，多半是核心刚重启或测速地址不通，不是节点的问题，
      // 这时候一个都不删，免得整组节点全被藏起来
      const recordGroupTimeouts = (timeoutNames: string[]): void => {
        if (timeoutNames.length === 0) return
        if (timeoutNames.length >= proxies.length) {
          notify('整组测速全部超时，未删除节点（请检查网络或测速地址）', { variant: 'warning' })
          return
        }
        recordTimeoutProxies(timeoutNames)
      }

      try {
        if (delayTestUseGroupApi) {
          const result = await mihomoGroupDelay(group.name, testUrl)
          // 组测速接口超时的节点 delay 是 0（或没有条目），只认这次测到的节点
          const timeoutNames = proxies
            .filter((proxy) => !(result[proxy.name] > 0))
            .map((proxy) => proxy.name)
          recordGroupTimeouts(timeoutNames)
          recordRecoveredProxies(
            proxies.filter((proxy) => result[proxy.name] > 0).map((proxy) => proxy.name)
          )
          return
        }

        const timeoutNames: string[] = []
        const okNames: string[] = []
        await runDelayTestsWithConcurrency(proxies, delayTestConcurrency, async (proxy) => {
          try {
            await mihomoProxyDelay(proxy.name, testUrl, getProviderName(proxy))
            okNames.push(proxy.name)
          } catch {
            timeoutNames.push(proxy.name)
          }
        })
        recordGroupTimeouts(timeoutNames)
        recordRecoveredProxies(okNames)
      } catch {
        // ignore
      } finally {
        mutate()
        setGroupDelaying(index, false)
      }
    },
    [
      allProxies,
      groups,
      delayTestUseGroupApi,
      delayTestConcurrency,
      removeTimeoutProxies,
      removedProxies,
      recordTimeoutProxies,
      mutate,
      getDelayTestUrl,
      setGroupDelaying
    ]
  )

  const calcCols = useCallback((): number => {
    if (window.matchMedia('(min-width: 1536px)').matches) {
      return 5
    } else if (window.matchMedia('(min-width: 1280px)').matches) {
      return 4
    } else if (window.matchMedia('(min-width: 1024px)').matches) {
      return 3
    } else {
      return 2
    }
  }, [])

  const toggleOpen = useCallback((index: number, currentlyOpen: boolean) => {
    const newVal = !currentlyOpen
    if (rememberProxyGroupOpenStateRef.current) {
      const groupName = groupsRef.current[index]?.name
      if (groupName) proxyGroupPageCache.isOpen[groupName] = newVal
    }
    setIsOpen((prev) => {
      const newOpen = [...prev]
      newOpen[index] = newVal
      return newOpen
    })
    if (currentlyOpen) {
      setIsOpenContent((prev) => {
        const newOpen = [...prev]
        newOpen[index] = false
        return newOpen
      })
    } else {
      setTimeout(() => {
        setIsOpenContent((prev) => {
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
      }, 0)
    }
  }, [])

  const updateSearchValue = useCallback((index: number, value: string) => {
    if (rememberProxyGroupOpenStateRef.current) {
      const groupName = groupsRef.current[index]?.name
      if (groupName) proxyGroupPageCache.searchValue[groupName] = value
    }
    setSearchValue((prev) => {
      const newSearchValue = [...prev]
      newSearchValue[index] = value
      return newSearchValue
    })
    if (value) {
      setIsOpen((prev) => {
        if (prev[index]) return prev
        if (rememberProxyGroupOpenStateRef.current) {
          const groupName = groupsRef.current[index]?.name
          if (groupName) proxyGroupPageCache.isOpen[groupName] = true
        }
        const newOpen = [...prev]
        newOpen[index] = true
        return newOpen
      })
      setTimeout(() => {
        setIsOpenContent((prev) => {
          if (prev[index]) return prev
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
      }, 0)
    }
  }, [])

  const doScrollToCurrentProxy = useCallback(
    (index: number) => {
      let i = 0
      for (let j = 0; j < index; j++) {
        i += groupCounts[j]
      }
      const proxies = allProxies[index].length > 0 ? allProxies[index] : groups[index].all
      const currentIndex = proxies.findIndex((proxy) => proxy.name === groups[index].now)
      if (currentIndex >= 0) {
        i += Math.floor(currentIndex / cols)
      }
      virtuosoRef.current?.scrollToIndex({
        index: Math.floor(i),
        align: 'start',
        behavior: 'smooth'
      })
    },
    [groupCounts, allProxies, groups, cols]
  )

  useEffect(() => {
    if (pendingScrollRef.current !== null && isOpenContent[pendingScrollRef.current]) {
      const index = pendingScrollRef.current
      pendingScrollRef.current = null
      setTimeout(() => doScrollToCurrentProxy(index), 150)
    }
  }, [isOpenContent, doScrollToCurrentProxy])

  const scrollToCurrentProxy = useCallback(
    (index: number) => {
      if (!isOpenContentRef.current[index]) {
        pendingScrollRef.current = index
        setIsOpen((prev) => {
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
        setTimeout(() => {
          setIsOpenContent((prev) => {
            const newOpen = [...prev]
            newOpen[index] = true
            return newOpen
          })
        }, 0)
      } else {
        doScrollToCurrentProxy(index)
      }
    },
    [doScrollToCurrentProxy]
  )

  const onGroupDelayRef = useRef(onGroupDelay)
  onGroupDelayRef.current = onGroupDelay
  const onGroupDelayStable = useCallback((i: number) => {
    onGroupDelayRef.current(i)
  }, [])

  const scrollToCurrentProxyRef = useRef(scrollToCurrentProxy)
  scrollToCurrentProxyRef.current = scrollToCurrentProxy
  const scrollToCurrentProxyStable = useCallback((i: number) => {
    scrollToCurrentProxyRef.current(i)
  }, [])

  // stable refs for Virtuoso callbacks
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const groupDisplayLayoutRef = useRef(groupDisplayLayout)
  groupDisplayLayoutRef.current = groupDisplayLayout
  const searchValueRef = useRef(searchValue)
  searchValueRef.current = searchValue
  const delayingRef = useRef(delaying)
  delayingRef.current = delaying
  const groupCountsRef = useRef(groupCounts)
  groupCountsRef.current = groupCounts
  const allProxiesRef = useRef(allProxies)
  allProxiesRef.current = allProxies
  const colsRef = useRef(cols)
  colsRef.current = cols
  const mutateRef = useRef(mutate)
  mutateRef.current = mutate
  const onProxyDelayRef = useRef(onProxyDelay)
  onProxyDelayRef.current = onProxyDelay
  const onChangeProxyRef = useRef(onChangeProxy)
  onChangeProxyRef.current = onChangeProxy
  const proxyDisplayLayoutRef = useRef(proxyDisplayLayout)
  proxyDisplayLayoutRef.current = proxyDisplayLayout
  const showGroupSelectedProxyRef = useRef(showGroupSelectedProxy)
  showGroupSelectedProxyRef.current = showGroupSelectedProxy
  const showProxyDetailTooltipRef = useRef(showProxyDetailTooltip)
  showProxyDetailTooltipRef.current = showProxyDetailTooltip
  const proxyCols2Ref = useRef(proxyCols)
  proxyCols2Ref.current = proxyCols
  const toggleOpenRef = useRef(toggleOpen)
  toggleOpenRef.current = toggleOpen
  const updateSearchValueRef = useRef(updateSearchValue)
  updateSearchValueRef.current = updateSearchValue

  useEffect(() => {
    groups.forEach((group) => {
      if (group.icon && group.icon.startsWith('http') && !localStorage.getItem(group.icon)) {
        getImageDataURL(group.icon).then((dataURL) => {
          localStorage.setItem(group.icon, dataURL)
          mutate()
        })
      }
    })
  }, [groups, mutate])

  useEffect(() => {
    if (proxyCols !== 'auto') {
      setCols(parseInt(proxyCols))
      return
    }
    setCols(calcCols())
    const handleResize = (): void => {
      setCols(calcCols())
    }
    window.addEventListener('resize', handleResize)
    return (): void => {
      window.removeEventListener('resize', handleResize)
    }
  }, [proxyCols, calcCols])

  const groupContent = useCallback(
    (index: number) => {
      const g = groupsRef.current
      return g[index] ? (
        <GroupHeader
          index={index}
          group={g[index]}
          isOpen={isOpen[index]}
          isLast={index === g.length - 1}
          groupDisplayLayout={groupDisplayLayoutRef.current}
          searchValue={searchValueRef.current[index]}
          delaying={delayingRef.current[index]}
          onToggle={toggleOpenRef.current}
          onUpdateSearch={updateSearchValueRef.current}
          onScrollToProxy={scrollToCurrentProxyStable}
          onGroupDelay={onGroupDelayStable}
        />
      ) : (
        <div>Never See This</div>
      )
    },
    [isOpen, scrollToCurrentProxyStable, onGroupDelayStable]
  )

  const itemContent = useCallback((index: number, groupIndex: number) => {
    const gc = groupCountsRef.current
    const ap = allProxiesRef.current
    const grps = groupsRef.current
    const c = colsRef.current
    const pCols = proxyCols2Ref.current
    const pLayout = proxyDisplayLayoutRef.current
    const showGroupSelected = showGroupSelectedProxyRef.current
    const showTooltip = showProxyDetailTooltipRef.current
    let innerIndex = index
    for (let i = 0; i < groupIndex; i++) {
      innerIndex -= gc[i]
    }
    const proxies = ap[groupIndex]
    const items: ReactNode[] = []
    for (let i = 0; i < c; i++) {
      const proxy = proxies[innerIndex * c + i]
      if (!proxy) continue
      items.push(
        <ProxyItem
          key={proxy.name}
          mutateProxies={mutateRef.current}
          onProxyDelay={onProxyDelayRef.current}
          onSelect={onChangeProxyRef.current}
          proxy={proxy}
          group={grps[groupIndex]}
          proxyDisplayLayout={pLayout}
          showGroupSelectedProxy={showGroupSelected}
          showProxyDetailTooltip={showTooltip}
          selected={proxy.name === grps[groupIndex].now}
        />
      )
    }
    return proxies ? (
      <div
        style={{
          animation: 'proxy-row-in 0.15s ease both',
          ...(pCols !== 'auto' ? { gridTemplateColumns: `repeat(${pCols}, minmax(0, 1fr))` } : {})
        }}
        className={`grid ${
          pCols === 'auto'
            ? 'sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
            : ''
        } ${groupIndex === gc.length - 1 && innerIndex === gc[groupIndex] - 1 ? 'pb-2' : ''} gap-2 pt-2 mx-2`}
      >
        {items}
      </div>
    ) : (
      <div>Never See This</div>
    )
  }, [])

  return (
    <BasePage
      title="代理组"
      header={
        <Button
          size="sm"
          isIconOnly
          onPress={() => {
            setIsSettingDrawerOpen(true)
            setSettingDrawerReopenSignal((signal) => signal + 1)
          }}
          variant="ghost"
          data-color="default"
          className="app-nodrag"
        >
          <MdTune className="text-lg" />
        </Button>
      }
    >
      {isSettingDrawerOpen && (
        <ProxySettingDrawer
          reopenSignal={settingDrawerReopenSignal}
          onClose={() => setIsSettingDrawerOpen(false)}
        />
      )}
      {mode === 'direct' ? (
        <div className="h-full w-full flex justify-center items-center">
          <div className="flex flex-col items-center">
            <MdDoubleArrow className="text-foreground-500 text-[100px]" />
            <h2 className="text-foreground-500 text-[20px]">直连模式</h2>
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-50px)]">
          <GroupedVirtuoso
            ref={virtuosoRef}
            scrollerRef={scrollerRef}
            initialScrollTop={initialScrollTop}
            groupCounts={groupCounts}
            groupContent={groupContent}
            itemContent={itemContent}
            defaultItemHeight={72}
            overscan={200}
          />
        </div>
      )}
    </BasePage>
  )
}

export default Proxies

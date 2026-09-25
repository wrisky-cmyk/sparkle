import { Button, Tooltip, Spinner, Select, Switch, Tabs, ListBox } from '@heroui/react'

import React, { useEffect, useState, useRef } from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { BiSolidFileImport } from 'react-icons/bi'
import {
  applyTheme,
  closeFloatingWindow,
  closeTrayIcon,
  fetchThemes,
  getFilePath,
  importThemes,
  relaunchApp,
  readImageFileDataURL,
  resolveThemes,
  setDockVisible,
  showFloatingWindow,
  showTrayIcon,
  startMonitor,
  updateTrayIcon,
  writeTheme
} from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { platform } from '@renderer/utils/init'
import { useTheme } from 'next-themes'
import { IoIosHelpCircle, IoMdCloudDownload } from 'react-icons/io'
import { MdEditDocument } from 'react-icons/md'
import CSSEditorModal from './css-editor-modal'
import TrayIconCropModal from './tray-icon-crop-modal'
import { notify } from '@renderer/utils/notification'
import { loadImageElement, recolorImageElementToPngDataURL } from '@renderer/utils/image'
import defaultTrayIcon from '../../../../../resources/icon.png'

// 这些格式会先进裁剪弹窗转成 PNG（SVG 也在这里光栅化，Electron 的托盘不支持 SVG）
const cropTrayIconPattern = /\.(png|jpe?g|webp|svg)$/i
type TrayIconKey = 'customTrayIcon' | 'customTrayIconSysProxy' | 'customTrayIconTun'

const hexToRgbColor = (hex: string): { red: number; green: number; blue: number } | undefined => {
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

const AppearanceConfig: React.FC = () => {
  const { appConfig, patchAppConfig } = useAppConfig()
  const [customThemes, setCustomThemes] = useState<
    {
      key: string
      label: string
    }[]
  >()
  const [openCSSEditor, setOpenCSSEditor] = useState(false)
  const [trayIconCrop, setTrayIconCrop] = useState<{
    key: TrayIconKey
    dataURL: string
  } | null>(null)
  const [fetching, setFetching] = useState(false)
  const { setTheme } = useTheme()
  const {
    useDockIcon = true,
    showTraffic = false,
    proxyInTray = true,
    trayProxyDelayLayout = 'auto',
    customTrayIcon = '',
    customTrayIconSysProxy = '',
    customTrayIconTun = '',
    trayIconAutoTint = false,
    trayIconSysProxyColor = '#3b82f6',
    trayIconTunColor = '#f59e0b',
    disableTray = false,
    showFloatingWindow: showFloating = false,
    spinFloatingIcon = true,
    useWindowFrame = false,
    enableWindowDrag = false,
    showUpdateButtonAfterNotification = true,
    customTheme = 'default.css',
    appTheme = 'system'
  } = appConfig || {}
  const [localShowFloating, setLocalShowFloating] = useState(showFloating)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const tintTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    resolveThemes().then((themes) => {
      setCustomThemes(themes)
    })
  }, [])

  useEffect(() => {
    return (): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (tintTimeoutRef.current) {
        clearTimeout(tintTimeoutRef.current)
      }
    }
  }, [])

  const pickTrayIcon = async (key: TrayIconKey): Promise<void> => {
    const files = await getFilePath(
      ['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico', 'icns'],
      '选择托盘图标',
      '托盘图标'
    )
    if (!files?.[0]) return
    if (cropTrayIconPattern.test(files[0])) {
      setTrayIconCrop({ key, dataURL: await readImageFileDataURL(files[0]) })
      return
    }
    await patchAppConfig({ [key]: await readImageFileDataURL(files[0]) } as Partial<AppConfig>)
    await updateTrayIcon()
  }

  const clearTrayIcon = async (key: TrayIconKey): Promise<void> => {
    await patchAppConfig({ [key]: '' } as Partial<AppConfig>)
    await updateTrayIcon()
  }

  // 用「默认托盘图标」（没设就用内置图标）生成另外两个状态的着色版本
  const applyTrayIconAutoTint = async (
    baseIcon: string,
    sysProxyColor: string,
    tunColor: string
  ): Promise<void> => {
    const sysProxyRgbColor = hexToRgbColor(sysProxyColor)
    const tunRgbColor = hexToRgbColor(tunColor)
    if (!sysProxyRgbColor || !tunRgbColor) return

    try {
      const baseURL = baseIcon.startsWith('data:image/')
        ? baseIcon
        : baseIcon
          ? await readImageFileDataURL(baseIcon)
          : defaultTrayIcon
      const baseImage = await loadImageElement(baseURL)
      const sysProxyIcon = recolorImageElementToPngDataURL(baseImage, sysProxyRgbColor)
      const tunIcon = recolorImageElementToPngDataURL(baseImage, tunRgbColor)
      if (!sysProxyIcon || !tunIcon) return

      await patchAppConfig({
        customTrayIconSysProxy: sysProxyIcon,
        customTrayIconTun: tunIcon
      })
      await updateTrayIcon()
    } catch (e) {
      notify(e, { variant: 'danger' })
    }
  }

  useEffect(() => {
    if (!trayIconAutoTint || disableTray) return
    if (tintTimeoutRef.current) clearTimeout(tintTimeoutRef.current)
    tintTimeoutRef.current = setTimeout(() => {
      tintTimeoutRef.current = null
      void applyTrayIconAutoTint(customTrayIcon, trayIconSysProxyColor, trayIconTunColor)
    }, 200)
  }, [trayIconAutoTint, customTrayIcon, trayIconSysProxyColor, trayIconTunColor])

  const renderTrayIconSetting = (
    title: string,
    tooltip: string,
    key: TrayIconKey,
    value: string,
    managed = false
  ): React.ReactNode => (
    <SettingItem
      compatKey="legacy"
      title={title}
      actions={
        <Tooltip delay={0}>
          <Button isIconOnly size="sm" variant="ghost" data-color="default">
            <IoIosHelpCircle className="text-lg" />
          </Button>
          <Tooltip.Content>{tooltip}</Tooltip.Content>
        </Tooltip>
      }
      divider
    >
      <div className="flex min-w-0 max-w-[65%] items-center justify-end gap-2">
        {managed ? (
          <span className="text-xs text-default-500">由「按状态自动着色」生成</span>
        ) : (
          <>
            {value && (
              <span className="truncate text-xs text-default-500">
                {value.startsWith('data:image/') ? '已储存自定义图标' : value}
              </span>
            )}
            <Button
              size="sm"
              onPress={() => pickTrayIcon(key)}
              variant="secondary"
              data-color="default"
            >
              {value ? '更换图标' : '选择图标'}
            </Button>
            {value && (
              <Button
                size="sm"
                onPress={() => clearTrayIcon(key)}
                variant="ghost"
                data-color="default"
              >
                恢复默认
              </Button>
            )}
          </>
        )}
      </div>
    </SettingItem>
  )

  return (
    <>
      {openCSSEditor && (
        <CSSEditorModal
          theme={customTheme}
          onCancel={() => setOpenCSSEditor(false)}
          onConfirm={async (css: string) => {
            await writeTheme(customTheme, css)
            await applyTheme(customTheme)
            setOpenCSSEditor(false)
          }}
        />
      )}
      {trayIconCrop && (
        <TrayIconCropModal
          imageDataURL={trayIconCrop.dataURL}
          onCancel={() => setTrayIconCrop(null)}
          onConfirm={async (dataURL) => {
            await patchAppConfig({ [trayIconCrop.key]: dataURL } as Partial<AppConfig>)
            setTrayIconCrop(null)
            await updateTrayIcon()
          }}
        />
      )}
      <SettingCard header="外观设置">
        <SettingItem
          compatKey="legacy"
          title="显示悬浮窗"
          actions={
            <Tooltip delay={0}>
              <Button isIconOnly size="sm" variant="ghost" data-color="default">
                <IoIosHelpCircle className="text-lg" />
              </Button>
              <Tooltip.Content>
                {'未禁用 GPU 加速的情况下，悬浮窗可能会导致应用崩溃'}
              </Tooltip.Content>
            </Tooltip>
          }
          divider
        >
          <Switch
            size="sm"
            isSelected={localShowFloating}
            onChange={async (v) => {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
                timeoutRef.current = null
              }

              setLocalShowFloating(v)
              if (v) {
                await showFloatingWindow()
                timeoutRef.current = setTimeout(async () => {
                  await patchAppConfig({ showFloatingWindow: v })
                  timeoutRef.current = null
                }, 1000)
              } else {
                patchAppConfig({ showFloatingWindow: v })
                await closeFloatingWindow()
              }
            }}
            aria-label="显示悬浮窗"
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        {localShowFloating && (
          <>
            <SettingItem compatKey="legacy" title="根据网速旋转悬浮窗图标" divider>
              <Switch
                size="sm"
                isSelected={spinFloatingIcon}
                onChange={async (v) => {
                  await patchAppConfig({ spinFloatingIcon: v })
                  window.electron.ipcRenderer.send('updateFloatingWindow')
                }}
                aria-label="根据网速旋转悬浮窗图标"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
            <SettingItem compatKey="legacy" title="禁用托盘图标" divider>
              <Switch
                size="sm"
                isSelected={disableTray}
                onChange={async (v) => {
                  await patchAppConfig({ disableTray: v })
                  if (v) {
                    closeTrayIcon()
                  } else {
                    showTrayIcon()
                  }
                }}
                aria-label="禁用托盘图标"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
          </>
        )}
        {!disableTray && (
          <>
            {renderTrayIconSetting(
              '自定义托盘图标',
              '设置后托盘会使用此图标；开启网速显示时会与网速合成。PNG、JPG、WebP、SVG 会先裁剪后保存为 PNG。',
              'customTrayIcon',
              customTrayIcon
            )}
            <SettingItem
              compatKey="legacy"
              title="按状态自动着色"
              actions={
                <Tooltip delay={0}>
                  <Button isIconOnly size="sm" variant="ghost" data-color="default">
                    <IoIosHelpCircle className="text-lg" />
                  </Button>
                  <Tooltip.Content>
                    {
                      '用上面的默认图标自动生成系统代理、虚拟网卡两个状态的着色版本并写入对应的托盘图标；开启时请用下面的颜色调整，关掉后即可手动选择这两个图标。'
                    }
                  </Tooltip.Content>
                </Tooltip>
              }
              divider
            >
              <Switch
                size="sm"
                isSelected={trayIconAutoTint}
                onChange={async (v) => {
                  await patchAppConfig({ trayIconAutoTint: v })
                }}
                aria-label="按状态自动着色"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
            {trayIconAutoTint && (
              <>
                <SettingItem compatKey="legacy" title="系统代理着色" divider>
                  <input
                    type="color"
                    value={trayIconSysProxyColor}
                    onChange={async (e) => {
                      await patchAppConfig({ trayIconSysProxyColor: e.target.value })
                    }}
                    className="h-8 w-16 cursor-pointer rounded-md border border-default-200 bg-transparent"
                    aria-label="系统代理着色"
                  />
                </SettingItem>
                <SettingItem compatKey="legacy" title="虚拟网卡着色" divider>
                  <input
                    type="color"
                    value={trayIconTunColor}
                    onChange={async (e) => {
                      await patchAppConfig({ trayIconTunColor: e.target.value })
                    }}
                    className="h-8 w-16 cursor-pointer rounded-md border border-default-200 bg-transparent"
                    aria-label="虚拟网卡着色"
                  />
                </SettingItem>
              </>
            )}
            {renderTrayIconSetting(
              '托盘图标（系统代理）',
              '开启系统代理时使用此图标，留空则沿用上面的默认图标；开启自动着色时由上面的颜色生成。',
              'customTrayIconSysProxy',
              customTrayIconSysProxy,
              trayIconAutoTint
            )}
            {renderTrayIconSetting(
              '托盘图标（虚拟网卡）',
              '开启虚拟网卡时使用此图标；与系统代理同时开启时优先使用此图标。开启自动着色时由上面的颜色生成。',
              'customTrayIconTun',
              customTrayIconTun,
              trayIconAutoTint
            )}
          </>
        )}
        {platform !== 'linux' && (
          <>
            <SettingItem compatKey="legacy" title="托盘菜单显示节点信息" divider>
              <Switch
                size="sm"
                isSelected={proxyInTray}
                onChange={async (v) => {
                  await patchAppConfig({ proxyInTray: v })
                }}
                aria-label="托盘菜单显示节点信息"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
            {proxyInTray && (
              <SettingItem compatKey="legacy" title="托盘菜单节点延迟显示方式" divider>
                <Tabs
                  selectedKey={trayProxyDelayLayout}
                  onSelectionChange={async (v) => {
                    await patchAppConfig({
                      trayProxyDelayLayout: v as 'same-line' | 'new-line'
                    })
                    window.electron.ipcRenderer.send('updateTrayMenu')
                  }}
                  data-color="primary"
                  data-size="sm"
                  data-full-width={false}
                >
                  <Tabs.ListContainer>
                    <Tabs.List aria-label="选项">
                      <Tabs.Tab key="same-line" id="same-line">
                        同一行
                        <Tabs.Indicator />
                      </Tabs.Tab>
                      <Tabs.Tab key="new-line" id="new-line">
                        换行
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    </Tabs.List>
                  </Tabs.ListContainer>
                </Tabs>
              </SettingItem>
            )}
            <SettingItem
              compatKey="legacy"
              title={`${platform === 'win32' ? '任务栏' : '状态栏'}显示网速信息`}
              divider
            >
              <Switch
                size="sm"
                isSelected={showTraffic}
                onChange={async (v) => {
                  await patchAppConfig({ showTraffic: v })
                  await startMonitor()
                }}
                aria-label="启用"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
          </>
        )}
        {platform === 'darwin' && (
          <>
            <SettingItem compatKey="legacy" title="显示 Dock 图标" divider>
              <Switch
                size="sm"
                isSelected={useDockIcon}
                onChange={async (v) => {
                  await patchAppConfig({ useDockIcon: v })
                  setDockVisible(v)
                }}
                aria-label="显示 Dock 图标"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </SettingItem>
          </>
        )}
        <SettingItem compatKey="legacy" title="使用系统标题栏" divider>
          <Switch
            size="sm"
            isSelected={useWindowFrame}
            onChange={async (v) => {
              await patchAppConfig({ useWindowFrame: v })
              await relaunchApp()
            }}
            aria-label="使用系统标题栏"
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        {useWindowFrame && (
          <SettingItem
            compatKey="legacy"
            title="启用窗口拖动区域"
            actions={
              <Tooltip delay={0}>
                <Button isIconOnly size="sm" variant="ghost" data-color="default">
                  <IoIosHelpCircle className="text-lg" />
                </Button>
                <Tooltip.Content>
                  {'让应用内页面标题的空白区域可用于拖动窗口，适用于系统未提供可拖动标题栏的环境。'}
                </Tooltip.Content>
              </Tooltip>
            }
            divider
          >
            <Switch
              size="sm"
              isSelected={enableWindowDrag}
              onChange={async (v) => {
                await patchAppConfig({ enableWindowDrag: v })
                await relaunchApp()
              }}
              aria-label="启用窗口拖动区域"
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </SettingItem>
        )}
        <SettingItem compatKey="legacy" title="显示更新按钮" divider>
          <Switch
            size="sm"
            isSelected={showUpdateButtonAfterNotification}
            onChange={(v) => {
              patchAppConfig({ showUpdateButtonAfterNotification: v })
            }}
            aria-label="显示更新按钮"
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </SettingItem>
        <SettingItem compatKey="legacy" title="背景色" divider>
          <Tabs
            selectedKey={appTheme}
            onSelectionChange={(key) => {
              setTheme(key.toString())
              patchAppConfig({ appTheme: key as AppTheme })
            }}
            data-color="primary"
            data-size="sm"
            data-full-width={false}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="选项">
                <Tabs.Tab key="system" id="system">
                  自动
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab key="dark" id="dark">
                  深色
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab key="light" id="light">
                  浅色
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </SettingItem>
        <SettingItem
          compatKey="legacy"
          title="主题"
          actions={
            <>
              <Button
                size="sm"
                isIconOnly
                onPress={async () => {
                  setFetching(true)
                  try {
                    await fetchThemes()
                    setCustomThemes(await resolveThemes())
                  } catch (e) {
                    notify(e, { variant: 'danger' })
                  } finally {
                    setFetching(false)
                  }
                }}
                variant="ghost"
                data-color="default"
                isPending={fetching}
                isDisabled={fetching}
              >
                {fetching ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  <IoMdCloudDownload className="text-lg" />
                )}
              </Button>
              <Button
                size="sm"
                isIconOnly
                onPress={async () => {
                  const files = await getFilePath(['css'])
                  if (!files) return
                  try {
                    await importThemes(files)
                    setCustomThemes(await resolveThemes())
                  } catch (e) {
                    notify(e, { variant: 'danger' })
                  }
                }}
                variant="ghost"
                data-color="default"
              >
                <BiSolidFileImport className="text-lg" />
              </Button>
              <Button
                size="sm"
                isIconOnly
                onPress={async () => {
                  setOpenCSSEditor(true)
                }}
                variant="ghost"
                data-color="default"
              >
                <MdEditDocument className="text-lg" />
              </Button>
            </>
          }
        >
          {customThemes && (
            <Select
              aria-label="自定义主题"
              className={['w-[60%]'].filter(Boolean).join(' ')}
              data-size="sm"
              value={customTheme ?? null}
              onChange={async (v) => {
                try {
                  await patchAppConfig({ customTheme: v as string })
                } catch (e) {
                  notify(e, { variant: 'danger' })
                }
              }}
            >
              <Select.Trigger className="data-[hover=true]:bg-default-200">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover placement="bottom" shouldFlip containerPadding={56}>
                <ListBox>
                  {customThemes.map((theme) => (
                    <ListBox.Item key={theme.key} id={theme.key} textValue={theme.label}>
                      {theme.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          )}
        </SettingItem>
      </SettingCard>
    </>
  )
}

export default AppearanceConfig

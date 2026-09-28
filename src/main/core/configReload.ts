import { mainWindow } from '..'
import { getAppConfig, getProfileConfig } from '../config'
import { mihomoWorkConfigPath } from '../utils/dirs'
import { appendAppLog } from '../utils/log'
import { generateProfile } from './factory'
import { reloadMihomoConfig } from './mihomoApi'

// 测速名单变化后重新生成工作配置并让内核热重载，删掉的节点立刻从组里消失，
// 不用等下一次内核重启。多次变化合并成一次，避免测速过程中反复写盘重载。
const reloadDelay = 1200

let timer: NodeJS.Timeout | null = null
let queue: Promise<void> = Promise.resolve()

async function reloadCoreConfig(): Promise<void> {
  await generateProfile()
  const [{ diffWorkDir = false }, { current }] = await Promise.all([
    getAppConfig(),
    getProfileConfig()
  ])
  const configPath = diffWorkDir ? mihomoWorkConfigPath(current) : mihomoWorkConfigPath('work')
  await reloadMihomoConfig(configPath)
  // 组的成员变了，让代理页重新拉一次
  mainWindow?.webContents.send('groupsUpdated')
}

export function scheduleCoreConfigReload(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    queue = queue.then(reloadCoreConfig).catch((e) => {
      // 热重载失败不影响使用：下次生成配置（重开内核）时名单照样生效
      void appendAppLog(`[ProxyTest]: reload core config failed, ${e}\n`).catch(() => {})
    })
  }, reloadDelay)
  timer.unref?.()
}

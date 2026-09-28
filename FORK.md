# risky 的 Sparkle fork

基于 [xishang0128/sparkle](https://github.com/xishang0128/sparkle)，目前比上游多四块东西：

1. 系统代理 / 虚拟网卡用不同托盘图标，可以按状态自动着色（见下面「用法」）。
2. 修了 Linux 下非 GNOME/KDE 桌面的系统代理开关（Hyprland、sway 之类）。
3. 代理组里可以「测速后删除超时节点」：超时的直接从列表里删掉、重测也不再测它们，
   切系统代理 / 开关虚拟网卡后不用整组重测（见下）。

打包、安装和升级步骤见 [aur/sparkle-risky-git/README.md](aur/sparkle-risky-git/README.md)
（包名原为 `sparkle-fork-git` → `sparkle-wrisky-git`，现为 `sparkle-risky-git`）。

## 用法

设置 → 外观设置：

1. 「自定义托盘图标」选一张图，支持 PNG / JPG / WebP / SVG（SVG 会在裁剪弹窗里转成 PNG 再保存）。
2. 打开「按状态自动着色」，用两个取色器调颜色（默认蓝 `#3b82f6`、琥珀 `#f59e0b`）。
   会用上面那张图自动生成两个状态的着色版本，只有颜色进 app config，生成出来的 PNG 存在数据目录的
   `tray-icons.json` 缓存里（派生数据不进配置、不进备份）。
3. 不开自动着色也行，手动给两个状态各选一张图；留空则沿用默认图标。

取值优先级：**虚拟网卡 > 系统代理 > 默认**。托盘菜单勾选、全局快捷键、SSID guard、设置页开关
引起的状态变化都会立即切换图标；macOS 上开「显示网速」时也会用当前状态的图标做合成底图。

## 新增配置项

| 键                       | 默认值    | 说明                                            |
| ------------------------ | --------- | ----------------------------------------------- |
| `customTrayIconSysProxy` | `''`      | 开启系统代理时使用的图标（data URL 或文件路径） |
| `customTrayIconTun`      | `''`      | 开启虚拟网卡时使用的图标                        |
| `trayIconAutoTint`       | `false`   | 用默认图标自动生成上面两个状态的着色版本        |
| `trayIconSysProxyColor`  | `#3b82f6` | 自动着色时系统代理用的颜色                      |
| `trayIconTunColor`       | `#f59e0b` | 自动着色时虚拟网卡用的颜色                      |
| `removeTimeoutProxies`   | `false`   | 测速后把超时节点从列表里删掉，重测也不再测它们  |

## 测速后删除超时节点

设置 → 代理组页右上角齿轮 →「测速后删除超时节点」（`removeTimeoutProxies`）：

- 打开后，最近一次测速超时（mihomo 记为 `delay: 0`）的节点直接从列表里消失，测出延迟的节点
  排在同组最前面，没测过的跟在后面；每组内部仍按「节点排序方式」排。
- 名单一变，主进程就重新生成工作配置并让内核热重载（`PUT /configs`），删掉的节点立刻从组里
  消失，不用等下一次重启内核；点整组测速只测还留在列表里的节点，删掉的不再浪费时间干等超时。
  开着这个开关时整组测速改走逐节点接口——内核的整组测速接口会把已删掉的节点也测一遍。
- 名单（超时节点 + 已测节点）由主进程保存在数据目录的 `excluded-proxies.json`，按订阅 id 分开
  存、不过期：切系统代理、开关虚拟网卡、重启应用，甚至切到别的订阅再切回来，都还是删掉的状态。
- 更新订阅后会自动补测一遍，只测没测过的节点（已测出结果的、已删掉的都跳过），大订阅不用每次
  全量重测；新出现的节点会自动进入这套名单。
- 关掉开关只是暂时把它们显示回来，名单还在，重新打开马上又消失。

## Linux 系统代理

上游把系统代理交给 [sysproxy-go](https://github.com/UruhaLushia/sysproxy-go)，而它在 Linux 上只认
GNOME 系和 KDE 系桌面（见其 `sysproxy_linux.go`）。Hyprland、sway 这类合成器会直接返回
「不支持的桌面：xxx」，表现就是系统代理怎么都开不起来，虚拟网卡却一切正常。

fork 在调起 `sparkle-service` 时给子进程补一个 GNOME 标识（`XDG_CURRENT_DESKTOP=Hyprland:GNOME`），
让 sysproxy-go 走 GNOME 分支，也就是写 `org.gnome.system.proxy`。两点注意：

- 系统代理只对读这套 GNOME 设置的应用生效（GTK/GLib 系，以及按系统代理配置走的浏览器）；
  命令行工具、部分 Electron 应用不认它，要全局生效还是用虚拟网卡。
- 补的只是「执行命令」模式。Linux 的「服务模式」下环境由常驻服务进程决定，仍受上游限制。

## 排错

- 图标没跟着变：先看 `~/.config/sparkle/logs/app-*.log`，图标解码失败会打 `[Tray]: ...`。
- 最常见的原因是图标数据其实是 SVG、MIME 却写成 `image/png`（Electron 的托盘不支持 SVG，会解出空图并回落到默认图标）。
  用设置里的「选择图标」重选一次即可，会自动转成 PNG。
- Linux 上 `customTrayIcon*` 直接写 PNG 文件路径也可以；换了文件内容后切一次代理状态（或重新选一次图标）才会重新加载。
- 系统代理报「不支持的桌面」：确认装的是 fork 构建（`sparkle-risky-git`），且已按上面步骤重新打包，见「Linux 系统代理」。

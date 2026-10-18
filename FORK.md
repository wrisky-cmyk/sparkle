# risky 的 Sparkle fork

基于 [xishang0128/sparkle](https://github.com/xishang0128/sparkle)，目前比上游多以下几块东西：

1. 系统代理 / 虚拟网卡用不同托盘图标，可以按状态自动着色（见下面「用法」）。
2. 修了 Linux 下非 GNOME/KDE 桌面的系统代理开关（Hyprland、sway 之类）。
3. 代理组支持先延迟筛通、再测下载速度，并按下载速度排序；计费订阅可以只测延迟（见下）。
4. 「测速后彻底删除超时节点」：从 `proxies` / provider 配置里移除，不只是从组里隐藏（见下）。

打包、安装和升级步骤见 [aur/sparkle-risky-git/README.md](aur/sparkle-risky-git/README.md)
（包名原为 `sparkle-fork-git` → `sparkle-wrisky-git`，现为 `sparkle-risky-git`）。

## 用法

设置 → 外观设置：

1. 「自定义托盘图标」选一张图，支持 PNG / JPG / WebP / SVG（SVG 会在裁剪弹窗里转成 PNG 再保存）。
2. 打开「按状态自动着色」，用两个取色器调颜色（默认蓝 `#3390ec`、绿 `#3fb950`；蓝与 Tinted 主题的强调色同源）。
   会用上面那张图自动生成两个状态的着色版本，只有颜色进 app config，生成出来的 PNG 存在数据目录的
   `tray-icons.json` 缓存里（派生数据不进配置、不进备份）。
3. 不开自动着色也行，手动给两个状态各选一张图；留空则沿用默认图标。

取值优先级：**虚拟网卡 > 系统代理 > 默认**。托盘菜单勾选、全局快捷键、SSID guard、设置页开关
引起的状态变化都会立即切换图标；macOS 上开「显示网速」时也会用当前状态的图标做合成底图。

## 主题：Tinted

`themes/tinted.css` 主题：浅色用 `#3390ec`铺窗口底色，深色（`#17212b` / `#5288c1`）只覆盖 HeroUI 的调色板变量，不动布局、圆角和阴影，所以亮/暗模式都跟着系统切换。

装法是把文件丢进数据目录的 `themes/`（Linux 上是 `~/.config/sparkle/themes/`，Windows 是
`%APPDATA%\sparkle\themes\`，macOS 是 `~/Library/Application Support/sparkle/themes/`），
然后在 设置 → 外观设置 → 自定义主题 里选「Tinted」；也可以直接改 `config.yaml` 的
`customTheme: tinted.css`。

## 新增配置项

| 键                       | 默认值    | 说明                                            |
| ------------------------ | --------- | ----------------------------------------------- |
| `customTrayIconSysProxy` | `''`      | 开启系统代理时使用的图标（data URL 或文件路径） |
| `customTrayIconTun`      | `''`      | 开启虚拟网卡时使用的图标                        |
| `trayIconAutoTint`       | `false`   | 用默认图标自动生成上面两个状态的着色版本        |
| `trayIconSysProxyColor`  | `#3390ec` | 自动着色时系统代理用的颜色                      |
| `trayIconTunColor`       | `#3fb950` | 自动着色时虚拟网卡用的颜色                      |
| `removeTimeoutProxies`   | `false`   | 测速后彻底删除超时节点，重测也不再测它们        |
| `downloadSpeedTestEnabled` | `true`  | 延迟测通后再测下载速度                          |
| `downloadSpeedTestAuto` | `false`    | 订阅更新后的自动测速是否包含下载测速            |
| `downloadSpeedTestUrl`  | Cloudflare | 下载测速地址，支持 `{bytes}` 占位符             |
| `downloadSpeedTestBytes` | `10485760` | 单节点下载测速上限，默认 10 MB                 |
| `downloadSpeedTestTimeout` | `15000` | 下载测速超时，单位毫秒                          |
| `downloadSpeedTestConcurrency` | `4` | 下载测速并发数，上限 4                          |

## 下载测速排行

设置 → 代理组页右上角齿轮：

- 「启用下载测速」（`downloadSpeedTestEnabled`）打开后，单节点和整组测速都会先走原有延迟
  接口筛出连通节点，再对连通节点下载固定大小的文件；节点徽标显示 `↓12.3M` 这类速度，
  排序方式里可以选「下载速度」。
- 「订阅更新后自动测下载」（`downloadSpeedTestAuto`）只控制订阅更新后的自动测速是否包含
  下载阶段；关掉时自动测速仍然只补延迟，手动测速不受影响。
- 测速通过本机 `127.0.0.1:39080-39083` 的隐藏 mixed listener 完成，监听器绑定隐藏代理组，
  不切换用户当前选中的节点；并发数上限就是这 4 个槽位。
- 测速地址、文件大小、超时和并发数都可以在同一个设置页调整。默认地址是 Cloudflare 的
  `__down` 接口，域名不通时换成自己的大文件地址即可。

### 计费订阅

订阅编辑里的「计费订阅」开关（`ProfileItem.metered`）打开后，该订阅的节点只测延迟，
不进入下载测速队列，避免消耗套餐流量。单节点手动测速也会遵守这个开关；需要临时测一次时，
先关掉计费标记或换用不计费的订阅。

## 测速后彻底删除超时节点

设置 → 代理组页右上角齿轮 →「测速后彻底删除超时节点」（`removeTimeoutProxies`）：

- 打开后，最近一次测速超时（mihomo 记为 `delay: 0`）的节点会从内联 `proxies` 中删除；
  provider 节点通过 provider 级 `exclude-filter` 在加载前过滤，不会进入内核内存，也不只
  是藏在代理组里。代理组里的引用会同步清理；某组被删空时保留 `DIRECT` 兜底，避免规则引用
  空组。
- 名单一变，主进程就重新生成工作配置并让内核热重载（`PUT /configs`），删掉的节点立刻从配置里
  消失，不用等下一次重启内核；点整组测速只测还留在列表里的节点，删掉的不再浪费时间干等超时。
  开着这个开关时整组测速改走逐节点接口——内核的整组测速接口会把已删掉的节点也测一遍。
- 名单（超时节点 + 已测节点）由主进程保存在数据目录的 `excluded-proxies.json`，按订阅 id 分开
  存、不过期：切系统代理、开关虚拟网卡、重启应用，甚至切到别的订阅再切回来，都还是删掉的状态。
- 更新订阅后会自动补测一遍，只测没测过的节点（已测出结果的、已删掉的都跳过），大订阅不用每次
  全量重测；新出现的节点会自动进入这套名单。
- 关掉开关会重新生成配置，节点马上恢复；名单还在，重新打开马上又会被删除。也可以在代理组
  设置里点「恢复已删除节点」清空名单。
- 被删除的节点已经不在内核里，不会被自动测速重新发现；要恢复它们，用上面的恢复按钮或先关掉
  开关。

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

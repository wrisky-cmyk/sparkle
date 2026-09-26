# wrisky 的 Sparkle fork

基于 [xishang0128/sparkle](https://github.com/xishang0128/sparkle)，加了「系统代理 / 虚拟网卡使用不同托盘图标」，
并修了 Linux 下非 GNOME/KDE 桌面的系统代理开关。
打包、安装和升级步骤见 [aur/sparkle-fork-git/README.md](aur/sparkle-fork-git/README.md)。

## 用法

设置 → 外观设置：

1. 「自定义托盘图标」选一张图，支持 PNG / JPG / WebP / SVG（SVG 会在裁剪弹窗里转成 PNG 再保存）。
2. 打开「按状态自动着色」，用两个取色器调颜色（默认蓝 `#3b82f6`、琥珀 `#f59e0b`）。
   会用上面那张图自动生成两个状态的着色版本，写入 `customTrayIconSysProxy` / `customTrayIconTun`。
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
- 系统代理报「不支持的桌面」：确认装的是 fork 构建（`sparkle-fork-git`），且已按上面步骤重新打包，见「Linux 系统代理」。

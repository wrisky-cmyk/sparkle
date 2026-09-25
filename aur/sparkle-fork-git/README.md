# sparkle-fork-git

wrisky 的 Sparkle fork 打包，与 AUR 上的 `sparkle-git` / `sparkle-bin` /
`sparkle-rolling-bin` 无关，`paru -Syu` 不会拿上游版本覆盖本包。

## 构建与安装

```bash
cd aur/sparkle-fork-git
makepkg -f
sudo pacman -U sparkle-fork-git-<pkgver>-x86_64.pkg.tar.zst
```

默认从 <https://github.com/wrisky-cmyk/sparkle> 的 `master` 拉源码。想直接构建本地
checkout（改完不用先 push）：

```bash
_src="git+file:///path/to/sparkle" makepkg -f
```

## 同步上游

```bash
git remote add upstream https://github.com/xishang0128/sparkle.git   # 只需执行一次
git fetch upstream
git merge upstream/master        # 或 git rebase upstream/master
git push fork master
cd aur/sparkle-fork-git && makepkg -f
```

## 相对上游的改动

- `customTrayIconSysProxy` / `customTrayIconTun`：系统代理、虚拟网卡各用一张托盘图标，
  优先级为 TUN > 系统代理 > 默认（`customTrayIcon`），留空则沿用到默认图标。
  设置里的入口在「外观设置」。
- `makepkg` 会把 `pkgver()` 算出的版本写回 PKGBUILD，每次构建后 `git status` 变脏是正常的。

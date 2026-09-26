# sparkle-wrisky-git

wrisky 的 Sparkle fork 打包（以前叫 `sparkle-fork-git`，已改名）。包名故意和 AUR 上的
`sparkle-git` / `sparkle-bin` / `sparkle-rolling-bin` 不一样，所以 `paru -Syu` 只会去升级 AUR
里那几个包，不会用上游版本把它覆盖掉。

- fork：<https://github.com/wrisky-cmyk/sparkle>（分支 `master`）
- 上游：<https://github.com/xishang0128/sparkle>
- 相对上游的功能改动：见仓库根目录 [FORK.md](../../FORK.md)

## 安装 / 升级

```bash
cd aur/sparkle-wrisky-git
makepkg -f
sudo pacman -U sparkle-wrisky-git-*.pkg.tar.zst
```

装完重启 Sparkle。`pkgver` 由 `pkgver()` 从 git 描述生成（fork 上没有 tag，所以形如
`r1320.g5238f40`），`makepkg` 会把它写回 PKGBUILD——构建后 `git status` 变脏是正常的，提不提交都行。

首装会顶掉 `sparkle` / `sparkle-git` / `sparkle-rolling-bin` / 旧名的 `sparkle-fork-git` 等
（PKGBUILD 里写了 conflicts），pacman 会问一次是否替换。

## 以后升级上游代码

```bash
# 1) 合并上游（首次先加 remote）
cd ~/sparkle
git remote add upstream https://github.com/xishang0128/sparkle.git   # 只需一次
git fetch upstream
git merge upstream/master          # 或 git rebase upstream/master
git push fork master

# 2) 重新打包并安装
cd aur/sparkle-wrisky-git
makepkg -f
sudo pacman -U sparkle-wrisky-git-*.pkg.tar.zst
```

想直接构建本地 checkout（改完不必先 push）：

```bash
_src="git+file://$HOME/sparkle" makepkg -f
```

## 说明

- 本目录是仓库里唯一为 fork 维护的包，其余 `aur/*` 保持上游原样。
- `makepkg` 会在本目录留下 `src/`、`pkg/` 和裸仓库目录 `sparkle/`，已被根目录 `.gitignore` 忽略。
- 想回上游版本：`sudo pacman -Rns sparkle-wrisky-git && paru -S sparkle-rolling-bin`。

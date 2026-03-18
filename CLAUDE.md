# CLAUDE.md

## Project Overview

Inkess Claude Code CLI — 零配置 Claude Code 桌面客户端。内置原生 Claude Code CLI，登录 Inkess 账号即用，无需 Node.js / 环境变量 / 命令行知识。

## Tech Stack

- Electron 41 + electron-vite + React 19 + TypeScript
- xterm.js（终端渲染）+ node-pty（PTY 进程）
- zustand（状态管理）
- electron-updater（应用自动更新）
- electron-builder（打包）

## Repository Structure

```
inkess-claude-code-cli/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.ts       #   IPC handlers, 窗口管理
│   │   ├── cli/           #   CLI 二进制管理（下载/安装/更新）
│   │   ├── pty/           #   PTY 会话管理（node-pty）
│   │   ├── auth/          #   认证管理（登录/注册/token）
│   │   ├── updater.ts     #   应用自动更新（electron-updater）
│   │   ├── analytics.ts   #   埋点
│   │   └── logger.ts      #   日志
│   ├── preload/           # Preload 脚本（contextBridge API）
│   └── renderer/          # React 渲染进程
│       ├── App.tsx        #   主应用（TitleTabBar, Sidebar, Terminal）
│       ├── stores/        #   zustand stores（auth, terminal, settings）
│       ├── i18n/          #   国际化（en.ts, zh.ts）
│       └── views/         #   页面组件（login, settings, sidebar, setup）
├── scripts/
│   ├── release-app.sh     # 一键发布脚本
│   └── .env               # OSS 凭证（gitignore）
├── .github/workflows/
│   └── build-win.yml      # GitHub Actions: Windows 构建 + OSS 上传
├── resources/             # 应用图标
├── build/                 # macOS entitlements
└── package.json           # 版本号 + electron-builder 配置
```

## Key Commands

```bash
# 开发
npm run dev

# 构建
npm run build              # electron-vite build
npm run dist:mac           # build + package Mac DMG
npm run dist:win           # build + package Windows exe

# Native module rebuild（node-pty 架构不匹配时）
npx electron-rebuild -f -w node-pty

# 发布（一键）
./scripts/release-app.sh          # patch +1 自动发布
./scripts/release-app.sh 0.3.0    # 指定版本号
```

## Release Process

### 一键发布

```bash
./scripts/release-app.sh
```

脚本自动完成以下全部步骤：

1. **检查前置条件** — node/npx/gh/python3/oss2 是否可用
2. **Build** — `electron-vite build`（用当前版本号构建，失败不影响版本）
3. **Bump 版本号** — 构建成功后才修改 `package.json`（失败自动回滚）
4. **打包 Mac DMG** — arm64 + x64，使用本地 dmgbuild 缓存避免下载失败
5. **上传 Mac 到 OSS** — DMG + blockmap + latest-mac.yml + `latest/` 永久链接
6. **更新 meta.json** — OSS 上的版本元数据
7. **更新 Homebrew Cask** — 自动算 sha256，更新 `~/work-inkess/homebrew-tap/` 并推送
8. **Commit + Tag + Push** — 推送到 GitHub，触发 Actions
9. **GitHub Actions 自动** — 构建 Windows exe → 上传 GitHub Release + OSS + `latest/`

### 发布产物分发渠道

| 平台 | 永久下载链接（latest/） | 版本化链接 |
|------|------------------------|-----------|
| Mac arm64 | `https://download.starapp.net/app-releases/latest/macos-arm64.dmg` | `app-releases/Inkess Claude Code CLI-{ver}-arm64.dmg` |
| Mac x64 | `https://download.starapp.net/app-releases/latest/macos-x64.dmg` | `app-releases/Inkess Claude Code CLI-{ver}.dmg` |
| Windows | `https://download.starapp.net/app-releases/latest/windows-x64.exe` | `app-releases/Inkess Claude Code CLI Setup {ver}.exe` |
| Mac | `brew tap gezhigang000/tap && brew install --cask inkess-claude-code-cli` | — |
| 全平台 | `https://github.com/gezhigang000/inkess-claude-code-cli/releases` | — |
| 版本元数据 | `https://download.starapp.net/app-releases/meta.json` | — |

### OSS 文件结构

```
inkess-install-file/app-releases/
├── latest/                          # 永久下载链接（copy_object 覆盖）
│   ├── macos-arm64.dmg
│   ├── macos-x64.dmg
│   └── windows-x64.exe
├── meta.json                        # 版本元数据
├── latest-mac.yml                   # electron-updater Mac 更新检查
├── latest.yml                       # electron-updater Windows 更新检查
├── Inkess Claude Code CLI-0.2.2-arm64.dmg
├── Inkess Claude Code CLI-0.2.2.dmg
├── Inkess Claude Code CLI Setup 0.2.2.exe
└── ...（历史版本文件保留）
```

### 应用自动更新

- electron-updater 从 `https://download.starapp.net/app-releases/` 检查 `latest-mac.yml` / `latest.yml`
- Mac: latest-mac.yml 由本地 release 脚本上传
- Windows: latest.yml 由 GitHub Actions 上传

### 发布前提条件

- `scripts/.env` 含 OSS 凭证（`OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`）
- `gh` CLI 已认证
- `~/work-inkess/homebrew-tap/` 已 clone
- Apple Developer ID 证书在 Keychain 中（Mac 签名用）
- GitHub repo secrets 已配置 `OSS_ACCESS_KEY_ID` + `OSS_ACCESS_KEY_SECRET`（Windows CI 用）

## Architecture Notes

- **CLI 二进制管理**：从 `inkess-install-file.oss-cn-beijing.aliyuncs.com/cli-mirror` 下载 Claude Code CLI 二进制，存放在 `~/Library/Application Support/inkess-claude-code/cli/claude`
- **LLM API 代理**：`ANTHROPIC_BASE_URL` 设为 `https://llm.starapp.net/api/llm`，通过 Inkess 平台代理转发到上游
- **认证**：`ANTHROPIC_AUTH_TOKEN` 通过 PTY 环境变量注入，用户无需手动配置
- **node-pty 注意事项**：native module，`npm install` 后必须 `electron-rebuild` 确保架构匹配（arm64 Mac 上尤其重要）
- **DMG 构建**：npmmirror 的 dmgbuild 包经常 404，release 脚本使用 `CUSTOM_DMGBUILD_PATH` 指向本地缓存绕过

## Related Repos

- **inkess-platform**: `~/work-inkess/inkess-platform` — 主平台（文档在 `code/content/docs/setup/inkess-claude-code-cli.md`）
- **homebrew-tap**: `~/work-inkess/homebrew-tap` — Homebrew Cask 定义（`github.com/gezhigang000/homebrew-tap`）

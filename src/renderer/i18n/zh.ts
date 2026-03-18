import type { TranslationKey } from './en'

export const zh: Record<TranslationKey, string> = {
  // App
  'app.title': 'Inkess Claude Code CLI',
  'app.connected': '已连接',
  'app.balance': '余额',

  // Titlebar
  'toolbar.openInFinder': '在 {fileManager} 中打开',
  'toolbar.openInIde': '在 {ide} 中打开',

  // Login
  'login.title': 'Inkess Claude Code CLI',
  'login.signInSubtitle': '使用 Inkess 账号登录',
  'login.registerSubtitle': '创建 Inkess 账号',
  'login.signIn': '登录',
  'login.register': '注册',
  'login.emailOrUsername': '邮箱或用户名',
  'login.emailPlaceholder': 'you@example.com',
  'login.password': '密码',
  'login.passwordPlaceholder': '输入密码',
  'login.forgotPassword': '忘记密码？',
  'login.signingIn': '登录中...',
  'login.loginFailed': '登录失败',
  'login.email': '邮箱',
  'login.verificationCode': '验证码',
  'login.enterCode': '输入验证码',
  'login.sendCode': '发送验证码',
  'login.codeSent': '验证码已发送',
  'login.sendCodeFailed': '验证码发送失败',
  'login.createPassword': '设置密码',
  'login.moreOptions': '更多选项（用户名、邀请码）',
  'login.username': '用户名（可选）',
  'login.chooseUsername': '设置用户名',
  'login.referralCode': '邀请码（可选）',
  'login.enterReferralCode': '输入邀请码',
  'login.creatingAccount': '创建中...',
  'login.createAccount': '创建账号',
  'login.registrationFailed': '注册失败',

  // Setup
  'setup.checking': '检查环境中...',
  'setup.settingUp': '正在安装 Claude Code CLI',
  'setup.verifying': '正在验证 Claude Code CLI 安装',
  'setup.firstTime': '首次安装 — 只需片刻',
  'setup.checkEnv': '检查环境',
  'setup.downloading': '下载 Claude Code CLI...',
  'setup.verifyInstall': '验证安装',
  'setup.downloadComplete': '下载完成',
  'setup.verifyingInstall': '正在验证安装...',
  'setup.installComplete': '安装完成',
  'setup.retry': '重试',

  // Settings
  'settings.title': '设置',
  'settings.account': '账号',
  'settings.appearance': '外观',
  'settings.language': '语言',
  'settings.balance': '余额',
  'settings.topUp': '充值',
  'settings.changePassword': '修改密码',
  'settings.currentPassword': '当前密码',
  'settings.newPassword': '新密码',
  'settings.confirmPassword': '确认新密码',
  'settings.passwordsNotMatch': '两次输入的密码不一致',
  'settings.passwordChanged': '密码已修改',
  'settings.changingPassword': '修改中...',
  'settings.signOut': '退出登录',
  'settings.terminalFontSize': '终端字体大小',
  'settings.theme': '主题',
  'settings.themeAuto': '自动（跟随系统）',
  'settings.themeDark': '深色',
  'settings.themeLight': '浅色',
  'settings.languageAuto': '自动（跟随系统）',
  'settings.languageZh': '中文',
  'settings.languageEn': 'English',
  'settings.languageLabel': '界面语言',
  'settings.languageHint': '选择应用的显示语言',

  // Welcome
  'welcome.openFolder': '打开工作目录',
  'welcome.recentProjects': '最近项目',
  'welcome.noRecent': '打开一个工作目录开始使用',

  // Sidebar
  'sidebar.recentProjects': '最近项目',
  'sidebar.noProjects': '暂无项目',
  'sidebar.settings': '设置',
  'sidebar.cliStatus': 'Claude Code CLI',

  // Update
  'update.available': '有可用更新',
  'update.description': 'Claude Code CLI {latest} 可用（当前: {current}）',
  'update.now': '立即更新',
  'update.updating': '更新中...',
  'update.later': '稍后',

  // App Update
  'appUpdate.ready': 'v{version} 已准备好安装',
  'appUpdate.available': '应用更新 v{version} 可用',
  'appUpdate.restartUpdate': '重启并更新',
  'appUpdate.download': '下载',
}

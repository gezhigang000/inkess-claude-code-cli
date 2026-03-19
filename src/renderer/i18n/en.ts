export const en = {
  // App
  'app.title': 'Inkess Claude Code CLI',
  'app.connected': 'Connected',
  'app.balance': 'Balance',

  // Tab context menu
  'tab.openInFinder': 'Open in Finder',
  'tab.openInExplorer': 'Open in Explorer',
  'tab.openInIde': 'Open in {ide}',
  'tab.copyPath': 'Copy Path',
  'tab.closeTab': 'Close Tab',

  // Login
  'login.title': 'Inkess Claude Code CLI',
  'login.signInSubtitle': 'Sign in with your Inkess account',
  'login.registerSubtitle': 'Create a new Inkess account',
  'login.signIn': 'Sign In',
  'login.register': 'Register',
  'login.emailOrUsername': 'Email or Username',
  'login.emailPlaceholder': 'you@example.com',
  'login.password': 'Password',
  'login.passwordPlaceholder': 'Enter your password',
  'login.forgotPassword': 'Forgot password?',
  'login.signingIn': 'Signing in...',
  'login.loginFailed': 'Login failed',
  'login.email': 'Email',
  'login.verificationCode': 'Verification Code',
  'login.enterCode': 'Enter code',
  'login.sendCode': 'Send Code',
  'login.codeSent': 'Verification code sent',
  'login.sendCodeFailed': 'Failed to send code',
  'login.createPassword': 'Create a password',
  'login.moreOptions': 'More options (username, referral code)',
  'login.username': 'Username (optional)',
  'login.chooseUsername': 'Choose a username',
  'login.referralCode': 'Referral Code (optional)',
  'login.enterReferralCode': 'Enter referral code',
  'login.creatingAccount': 'Creating account...',
  'login.createAccount': 'Create Account',
  'login.registrationFailed': 'Registration failed',

  // Setup
  'setup.checking': 'Checking environment...',
  'setup.settingUp': 'Setting up Claude Code CLI',
  'setup.verifying': 'Verifying Claude Code CLI installation',
  'setup.firstTime': 'First-time setup — this only takes a moment',
  'setup.checkEnv': 'Checking environment',
  'setup.downloading': 'Downloading Claude Code CLI...',
  'setup.verifyInstall': 'Verifying installation',
  'setup.downloadComplete': 'Download complete',
  'setup.verifyingInstall': 'Verifying installation...',
  'setup.installComplete': 'Installation complete',
  'setup.retry': 'Retry',

  // Settings
  'settings.title': 'Settings',
  'settings.account': 'Account',
  'settings.appearance': 'Appearance',
  'settings.language': 'Language',
  'settings.balance': 'Balance',
  'settings.topUp': 'Top Up',
  'settings.changePassword': 'Change Password',
  'settings.currentPassword': 'Current password',
  'settings.newPassword': 'New password',
  'settings.confirmPassword': 'Confirm new password',
  'settings.passwordsNotMatch': 'Passwords do not match',
  'settings.passwordChanged': 'Password changed',
  'settings.changingPassword': 'Changing...',
  'settings.signOut': 'Sign Out',
  'settings.terminalFontSize': 'Terminal Font Size',
  'settings.theme': 'Theme',
  'settings.themeAuto': 'Auto (System)',
  'settings.themeDark': 'Dark',
  'settings.themeLight': 'Light',
  'settings.languageAuto': 'Auto (System)',
  'settings.languageZh': 'Chinese (中文)',
  'settings.languageEn': 'English',
  'settings.languageLabel': 'Display Language',
  'settings.languageHint': 'Choose the display language for the app',
  'settings.about': 'About',
  'settings.version': 'Version',

  // Welcome
  'welcome.openFolder': 'Open Working Directory',
  'welcome.recentProjects': 'Recent Projects',
  'welcome.noRecent': 'Open a working directory to get started',

  // Sidebar
  'sidebar.recentProjects': 'Recent Projects',
  'sidebar.noProjects': 'No projects yet',
  'sidebar.settings': 'Settings',
  'sidebar.cliStatus': 'Claude Code CLI',
  'sidebar.sessions': 'Sessions',
  'sidebar.active': 'Active',
  'sidebar.recent': 'Recent',
  'sidebar.yesterday': 'yesterday',

  // StatusBar
  'statusbar.preventingSleep': 'Preventing sleep',

  // Close Tab
  'tab.pressAgainToClose': 'Press again to close',

  // Settings (new)
  'settings.notifications': 'Notifications',
  'settings.notificationsEnabled': 'Desktop notifications',
  'settings.sleepInhibitor': 'Sleep Prevention',
  'settings.sleepInhibitorEnabled': 'Prevent sleep during tasks',

  // Command Palette
  'cmdPalette.placeholder': 'Type a command...',
  'cmdPalette.noResults': 'No matching commands',
  'cmdPalette.newTab': 'New Tab',
  'cmdPalette.settings': 'Settings',
  'cmdPalette.toggleTheme': 'Toggle Theme',
  'cmdPalette.modeSuggest': 'Mode: Suggest',
  'cmdPalette.modeAutoEdit': 'Mode: Auto Edit',
  'cmdPalette.modeFullAuto': 'Mode: Full Auto',

  // Update
  'update.available': 'Update Available',
  'update.description': 'Claude Code CLI {latest} is available (current: {current})',
  'update.now': 'Update Now',
  'update.updating': 'Updating...',
  'update.later': 'Later',

  // App Update
  'appUpdate.ready': 'v{version} ready to install',
  'appUpdate.available': 'App update v{version} available',
  'appUpdate.restartUpdate': 'Restart & Update',
  'appUpdate.download': 'Download',
}

export type TranslationKey = keyof typeof en

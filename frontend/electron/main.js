const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron')
const path = require('path')
const net = require('net')
const fs = require('fs')
const { spawn } = require('child_process')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow
let backendProcess = null

function getWindowIconPath() {
  // 优先使用 ico（Windows 兼容性更好），并根据运行模式选择路径
  const candidates = isDev
    ? [
        path.join(__dirname, '../public/icon.ico'),
        path.join(__dirname, '../public/icon.png')
      ]
    : [
        path.join(__dirname, '../dist/icon.ico'),
        path.join(__dirname, '../dist/icon.png')
      ]

  const hit = candidates.find((p) => fs.existsSync(p))
  if (!hit) {
    console.warn('[App] 未找到窗口图标文件，候选路径:', candidates)
    return undefined
  }
  return hit
}

function getBackendRuntimePaths() {
  const backendDir = path.join(process.resourcesPath, 'backend')
  const pythonExe = path.join(backendDir, 'python', 'python.exe')
  const backendEntry = path.join(backendDir, 'main.py')
  return { backendDir, pythonExe, backendEntry }
}

function startBackend() {
  if (isDev || backendProcess) return

  const { backendDir, pythonExe, backendEntry } = getBackendRuntimePaths()

  if (!fs.existsSync(pythonExe)) {
    console.warn('[Backend] 未找到嵌入式 Python:', pythonExe)
    return
  }
  if (!fs.existsSync(backendEntry)) {
    console.warn('[Backend] 未找到后端入口:', backendEntry)
    return
  }

  try {
    const bootstrap = [
      'import runpy, sys',
      `sys.path.insert(0, r"${backendDir.replace(/\\/g, '\\\\')}")`,
      `runpy.run_path(r"${backendEntry.replace(/\\/g, '\\\\')}", run_name="__main__")`
    ].join('; ')

    backendProcess = spawn(pythonExe, ['-c', bootstrap], {
      cwd: backendDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    backendProcess.stdout?.on('data', (data) => {
      console.log('[Backend][stdout]', data.toString().trim())
    })
    backendProcess.stderr?.on('data', (data) => {
      console.warn('[Backend][stderr]', data.toString().trim())
    })
    backendProcess.on('error', (err) => {
      console.error('[Backend] 启动失败:', err)
      backendProcess = null
    })
    backendProcess.on('exit', (code, signal) => {
      console.log(`[Backend] 已退出 code=${code} signal=${signal}`)
      backendProcess = null
    })

    console.log('[Backend] 启动命令:', pythonExe, backendEntry)
  } catch (e) {
    console.error('[Backend] 启动异常:', e)
    backendProcess = null
  }
}

function stopBackend() {
  if (!backendProcess) return
  try {
    backendProcess.kill()
  } catch (e) {
    console.warn('[Backend] 停止异常:', e)
  } finally {
    backendProcess = null
  }
}

// 检测后端是否已就绪
function waitForBackend(port, maxRetries = 20, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0
    const check = () => {
      const client = new net.Socket()
      client.setTimeout(300)
      client.connect(port, '127.0.0.1', () => {
        client.destroy()
        resolve()
      })
      client.on('error', () => {
        client.destroy()
        retries++
        if (retries >= maxRetries) {
          reject(new Error(`后端未就绪（请先启动 python main.py）`))
        } else {
          setTimeout(check, interval)
        }
      })
      client.on('timeout', () => {
        client.destroy()
        retries++
        if (retries >= maxRetries) {
          reject(new Error('后端连接超时'))
        } else {
          setTimeout(check, interval)
        }
      })
    }
    check()
  })
}

function createWindow() {
  const windowIcon = getWindowIconPath()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    title: 'Coda',
    icon: windowIcon,
    backgroundColor: '#ffffff',
  })

  if (isDev) {
    // 开发模式：加载 Vite 开发服务器（代理 /api 到后端）
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式：加载打包后的静态文件，/api 请求直接打到 127.0.0.1:8000
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 移除默认菜单栏
Menu.setApplicationMenu(null)

app.whenReady().then(async () => {
  if (!isDev) {
    startBackend()
    // 生产模式：等待后端就绪再打开窗口
    try {
      console.log('[App] 等待后端就绪 (127.0.0.1:8000)...')
      await waitForBackend(8000)
      console.log('[App] 后端已就绪')
    } catch (e) {
      console.warn('[App]', e.message)
      // 后端未就绪也继续打开，前端会显示连接错误
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopBackend()
})

// IPC 处理
ipcMain.handle('get-app-path', () => app.getPath('userData'))

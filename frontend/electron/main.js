const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const net = require('net')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow

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
    icon: path.join(__dirname, '../public/icon.png'),
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

app.whenReady().then(async () => {
  if (!isDev) {
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

// IPC 处理
ipcMain.handle('get-app-path', () => app.getPath('userData'))

import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions, shell } from 'electron';
import * as path from 'path';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow: BrowserWindow | null = null;

function createMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:openProject'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Run',
      submenu: [
        {
          label: 'Run',
          accelerator: 'F5',
          click: () => mainWindow?.webContents.send('menu:run'),
        },
        {
          label: 'Stop',
          accelerator: 'Shift+F5',
          click: () => mainWindow?.webContents.send('menu:stop'),
        },
        {
          label: 'Restart',
          accelerator: 'CmdOrCtrl+Shift+F5',
          click: () => mainWindow?.webContents.send('menu:restart'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Debug Panel',
          type: 'checkbox',
          checked: false,
          click: (item) => mainWindow?.webContents.send('menu:toggleDebug', item.checked),
        },
        {
          label: 'Output Console',
          type: 'checkbox',
          checked: true,
          click: (item) => mainWindow?.webContents.send('menu:toggleConsole', item.checked),
        },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Settings',
          click: () => mainWindow?.webContents.send('menu:settings'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub',
          click: () => shell.openExternal('https://github.com/okz-spec/okzVM'),
        },
        { type: 'separator' },
        {
          label: 'About okzVM',
          click: () => mainWindow?.webContents.send('menu:about'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'okzVM',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMenu();
    createWindow();
  }
});

ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'openDirectory'],
    filters: [
      { name: 'OKZ Project', extensions: ['okz', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return result;
});

ipcMain.handle('dialog:saveBytecode', async (_event, data: { buffer: ArrayBuffer; defaultName: string }) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: data.defaultName,
    filters: [{ name: 'OKZ Bytecode', extensions: ['okzb'] }],
  });
  if (!result.canceled && result.filePath) {
    const fs = require('fs');
    fs.writeFileSync(result.filePath, Buffer.from(data.buffer));
  }
  return result;
});

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  const fs = require('fs');
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.on('fs:readFileSync', (event, filePath: string) => {
  const fs = require('fs');
  try {
    event.returnValue = fs.readFileSync(filePath, 'utf-8');
  } catch {
    event.returnValue = null;
  }
});

ipcMain.on('fs:readFileSyncBinary', (event, filePath: string) => {
  const fs = require('fs');
  try {
    const buf = fs.readFileSync(filePath);
    event.returnValue = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch {
    event.returnValue = null;
  }
});

ipcMain.handle('fs:readFileBinary', async (_event, filePath: string) => {
  const fs = require('fs');
  const buf = fs.readFileSync(filePath);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
});

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  const fs = require('fs');
  fs.writeFileSync(filePath, content, 'utf-8');
});

ipcMain.handle('fs:listDir', async (_event, dirPath: string) => {
  const fs = require('fs');
  const p = require('path');
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.map((e: any) => ({
    name: e.name,
    isDirectory: e.isDirectory(),
    path: p.join(dirPath, e.name),
  }));
});

ipcMain.handle('fs:stat', async (_event, filePath: string) => {
  const fs = require('fs');
  try { return fs.statSync(filePath); } catch { return null; }
});

ipcMain.handle('fs:deleteFile', async (_event, filePath: string) => {
  const fs = require('fs');
  fs.unlinkSync(filePath);
});

ipcMain.handle('fs:isDirectory', async (_event, filePath: string) => {
  const fs = require('fs');
  return fs.statSync(filePath).isDirectory();
});

ipcMain.handle('fs:findProjectFile', async (_event, dirPath: string) => {
  const fs = require('fs');
  const p = require('path');
  for (const name of ['main.okz', 'main.okzb', 'manifest.json']) {
    const full = p.join(dirPath, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return { file: full, name };
    }
  }
  return null;
});

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  shell.openExternal(url);
});
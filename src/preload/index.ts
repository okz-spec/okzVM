import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  dialogOpenProject: () => ipcRenderer.invoke('dialog:openProject'),
  dialogSaveBytecode: (data: { buffer: ArrayBuffer; defaultName: string }) =>
    ipcRenderer.invoke('dialog:saveBytecode', data),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  readFileSync: (filePath: string) => ipcRenderer.sendSync('fs:readFileSync', filePath),
  readFileSyncBinary: (filePath: string) => ipcRenderer.sendSync('fs:readFileSyncBinary', filePath),
  readFileBinary: (filePath: string) => ipcRenderer.invoke('fs:readFileBinary', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  listDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
  isDirectory: (filePath: string) => ipcRenderer.invoke('fs:isDirectory', filePath),
  stat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
  deleteFile: (filePath: string) => ipcRenderer.invoke('fs:deleteFile', filePath),
  findProjectFile: (dirPath: string) => ipcRenderer.invoke('fs:findProjectFile', dirPath),
  shellOpenExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  onMenuAction: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeAllListeners(channel);
    const handler = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
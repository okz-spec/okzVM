interface ElectronAPI {
  dialogOpenProject: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  dialogSaveBytecode: (data: { buffer: ArrayBuffer; defaultName: string }) => Promise<{ canceled: boolean; filePath?: string }>;
  readFile: (filePath: string) => Promise<string>;
  readFileBinary: (filePath: string) => Promise<ArrayBuffer>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  listDir: (dirPath: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;
  isDirectory: (filePath: string) => Promise<boolean>;
  findProjectFile: (dirPath: string) => Promise<{ file: string; name: string } | null>;
  onMenuAction: (channel: string, callback: (...args: any[]) => void) => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
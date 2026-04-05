const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

const DATA_DIR   = path.join(app.getPath('userData'), 'dd-engine-data');
const STORE_FILE = path.join(DATA_DIR, 'reviews.json');
const CFG_FILE   = path.join(DATA_DIR, 'config.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
  ensureDir();
  try { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) {
  ensureDir();
  fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}
function loadReviews() {
  ensureDir();
  if (!fs.existsSync(STORE_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch { return []; }
}
function saveReviewsData(arr) {
  ensureDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

// ── S3 upload (optional — only if AWS credentials configured) ─────────────────
async function uploadToS3(key, content, cfg) {
  if (!cfg.s3Bucket) return null;
  try {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const clientCfg = { region: cfg.s3Region || 'eu-west-2' };
    if (cfg.awsAccessKeyId)     clientCfg.credentials = {
      accessKeyId:     cfg.awsAccessKeyId,
      secretAccessKey: cfg.awsSecretKey,
    };
    const s3 = new S3Client(clientCfg);
    const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    await s3.send(new PutObjectCommand({
      Bucket:               cfg.s3Bucket,
      Key:                  key,
      Body:                 body,
      ContentType:          key.endsWith('.pdf') ? 'application/pdf' : 'application/json',
      ServerSideEncryption: 'AES256',
    }));
    return `s3://${cfg.s3Bucket}/${key}`;
  } catch (e) {
    console.error('[S3]', e.message);
    return null;
  }
}

// ── Local path save (fallback or primary) ─────────────────────────────────────
function saveToLocalPath(filename, content, cfg) {
  const dir = cfg.localSavePath || DATA_DIR;
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { return null; }
  }
  const full = path.join(dir, filename);
  try {
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(full, data, 'utf8');
    return full;
  } catch (e) { return null; }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('save-review', async (_, entry) => {
  // 1. Always save to local JSON store
  const arr = loadReviews();
  const idx = arr.findIndex(r => r.key === entry.key);
  if (idx !== -1) arr[idx] = entry; else arr.unshift(entry);
  saveReviewsData(arr);

  // 2. Save JSON to configured path (S3 or local)
  const cfg = loadConfig();
  const jsonKey  = `reviews/${entry.key}.json`;
  const jsonData = JSON.stringify(entry, null, 2);

  let savedPath = null;
  if (cfg.s3Bucket) {
    savedPath = await uploadToS3(jsonKey, jsonData, cfg);
  }
  if (!savedPath) {
    savedPath = saveToLocalPath(`${entry.key}.json`, jsonData, cfg);
  }

  return { ok: true, count: arr.length, savedPath };
});

ipcMain.handle('load-reviews', () => loadReviews());

ipcMain.handle('delete-review', (_, key) => {
  saveReviewsData(loadReviews().filter(r => r.key !== key));
  return { ok: true };
});

ipcMain.handle('pick-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select financial document',
    filters: [{ name: 'Documents', extensions: ['pdf','docx','doc','xlsx','txt','csv'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false };
  return { ok: true, filePath: filePaths[0] };
});

ipcMain.handle('pick-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select save folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths.length) return { ok: false };
  return { ok: true, folderPath: filePaths[0] };
});

ipcMain.handle('read-file', (_, filePath) => {
  try {
    const buf  = fs.readFileSync(filePath);
    const ext  = path.extname(filePath).toLowerCase().replace('.','');
    const mime = ext === 'pdf'  ? 'application/pdf'
               : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
               : 'text/plain';
    return { ok:true, data:buf.toString('base64'), name:path.basename(filePath), ext, size:buf.length, mimeType:mime };
  } catch(e) { return { ok:false, error:e.message }; }
});

ipcMain.handle('get-config', ()       => loadConfig());
ipcMain.handle('save-config', (_, c) => { saveConfig({...loadConfig(), ...c}); return {ok:true}; });

// Legacy API key handlers
ipcMain.handle('get-api-key', ()      => loadConfig().apiKey || '');
ipcMain.handle('save-api-key',(_, k) => { saveConfig({...loadConfig(), apiKey:k}); return {ok:true}; });

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:1280, height:820, minWidth:960, minHeight:600,
    title:'DD Engine — Prime Alpha Securities',
    backgroundColor:'#070c14',
    autoHideMenuBar:true,
    webPreferences:{
      preload:path.join(__dirname,'preload.js'),
      contextIsolation:true,
      nodeIntegration:false,
      webSecurity:false,
    },
  });
  win.loadFile(path.join(__dirname,'renderer','documents.html'));
  win.webContents.setWindowOpenHandler(({url}) => {
    if(url.startsWith('http')) shell.openExternal(url);
    return {action:'deny'};
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if(process.platform!=='darwin') app.quit(); });
app.on('activate', () => { if(BrowserWindow.getAllWindows().length===0) createWindow(); });

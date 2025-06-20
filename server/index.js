const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

// 中間件
app.use(cors());
app.use(express.json());

// 請求日誌中間件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, req.body);
  next();
});

// 確保數據目錄存在
const DATA_DIR = path.join(__dirname, 'data');
const VIDEOS_DIR = path.join(DATA_DIR, 'videos');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

// 初始化存儲目錄
async function initStorage() {
  try {
    // 使用 /tmp 目錄，Railway 允許寫入
    const tmpDir = '/tmp/videowall';
    const tmpVideosDir = '/tmp/videowall/videos';
    const tmpRoomsFile = '/tmp/videowall/rooms.json';
    
    await fs.ensureDir(tmpDir);
    await fs.ensureDir(tmpVideosDir);
    
    // 更新全局變數
    global.DATA_DIR = tmpDir;
    global.VIDEOS_DIR = tmpVideosDir;
    global.ROOMS_FILE = tmpRoomsFile;
    
    // 確保 rooms.json 文件存在
    if (!await fs.pathExists(tmpRoomsFile)) {
      await fs.writeJson(tmpRoomsFile, {});
    }
    
    console.log('存儲目錄初始化完成:', tmpDir);
  } catch (error) {
    console.error('存儲目錄初始化錯誤:', error);
    // 如果 /tmp 也不行，使用內存存儲
    global.DATA_DIR = null;
    global.VIDEOS_DIR = null;
    global.ROOMS_FILE = null;
    global.ROOMS_DATA = {};
    console.log('使用內存存儲模式');
  }
}

// 讀取房間數據
async function readRooms() {
  try {
    if (global.ROOMS_FILE) {
      return await fs.readJson(global.ROOMS_FILE);
    } else {
      // 內存模式
      return global.ROOMS_DATA || {};
    }
  } catch (error) {
    return {};
  }
}

// 寫入房間數據
async function writeRooms(rooms) {
  try {
    if (global.ROOMS_FILE) {
      await fs.writeJson(global.ROOMS_FILE, rooms);
    } else {
      // 內存模式
      global.ROOMS_DATA = rooms;
    }
  } catch (error) {
    console.error('寫入房間數據失敗:', error);
  }
}

// 配置 multer 用於文件上傳
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const roomId = req.params.roomId;
    const videosDir = global.VIDEOS_DIR || '/tmp/videowall/videos';
    const roomDir = path.join(videosDir, roomId);
    try {
      fs.ensureDirSync(roomDir);
      cb(null, roomDir);
    } catch (error) {
      console.error('創建目錄失敗:', error);
      cb(error, null);
    }
  },
  filename: function (req, file, cb) {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 減少到 50MB 限制，避免內存問題
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('只允許上傳視頻文件'), false);
    }
  }
});

// 靜態文件服務 - 提供視頻文件訪問
app.use('/videos', (req, res, next) => {
  const videosDir = global.VIDEOS_DIR || '/tmp/videowall/videos';
  express.static(videosDir)(req, res, next);
});

// API 路由

// 創建新房間
app.post('/api/rooms', async (req, res) => {
  console.log('收到創建房間請求:', req.body);
  try {
    const { name } = req.body;
    const roomId = uuidv4();
    const roomName = name || `房間_${new Date().toLocaleString('zh-TW')}`;
    
    console.log('正在創建房間:', { roomId, roomName });
    
    const rooms = await readRooms();
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      videos: []
    };
    
    await writeRooms(rooms);
    console.log('房間創建成功:', roomId);
    
    res.json({
      success: true,
      room: rooms[roomId]
    });
  } catch (error) {
    console.error('創建房間錯誤:', error);
    res.status(500).json({ success: false, error: '創建房間失敗', details: error.message });
  }
});

// 獲取房間信息
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const rooms = await readRooms();
    
    if (!rooms[roomId]) {
      return res.status(404).json({ success: false, error: '房間不存在' });
    }
    
    res.json({
      success: true,
      room: rooms[roomId],
      videos: rooms[roomId].videos || []
    });
  } catch (error) {
    console.error('獲取房間信息錯誤:', error);
    res.status(500).json({ success: false, error: '獲取房間信息失敗' });
  }
});

// 上傳視頻到房間
app.post('/api/rooms/:roomId/videos', upload.array('videos', 20), async (req, res) => {
  try {
    const { roomId } = req.params;
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: '沒有上傳文件' });
    }
    
    const rooms = await readRooms();
    if (!rooms[roomId]) {
      return res.status(404).json({ success: false, error: '房間不存在' });
    }
    
    // 獲取當前最大的 upload_order
    const currentVideos = rooms[roomId].videos || [];
    let maxOrder = currentVideos.length > 0 ? Math.max(...currentVideos.map(v => v.upload_order)) : 0;
    
    const uploadedVideos = [];
    
    // 處理每個上傳的文件
    for (const file of files) {
      maxOrder++;
      
      const videoInfo = {
        id: uuidv4(),
        room_id: roomId,
        original_name: file.originalname,
        file_name: file.filename,
        file_path: `/videos/${roomId}/${file.filename}`,
        file_size: file.size,
        upload_order: maxOrder,
        created_at: new Date().toISOString()
      };
      
      uploadedVideos.push(videoInfo);
    }
    
    // 更新房間數據
    rooms[roomId].videos = [...(rooms[roomId].videos || []), ...uploadedVideos];
    rooms[roomId].updated_at = new Date().toISOString();
    
    await writeRooms(rooms);
    
    res.json({
      success: true,
      message: `成功上傳 ${uploadedVideos.length} 個視頻`,
      videos: uploadedVideos
    });
    
  } catch (error) {
    console.error('上傳視頻錯誤:', error);
    res.status(500).json({ success: false, error: '上傳視頻失敗' });
  }
});

// 刪除視頻
app.delete('/api/videos/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const rooms = await readRooms();
    
    // 查找包含該視頻的房間
    let targetRoom = null;
    let videoToDelete = null;
    
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const videoIndex = room.videos.findIndex(v => v.id === videoId);
      if (videoIndex !== -1) {
        targetRoom = room;
        videoToDelete = room.videos[videoIndex];
        room.videos.splice(videoIndex, 1);
        break;
      }
    }
    
    if (!videoToDelete) {
      return res.status(404).json({ success: false, error: '視頻不存在' });
    }
    
    // 刪除文件
    const videosDir = global.VIDEOS_DIR || '/tmp/videowall/videos';
    const filePath = path.join(videosDir, videoToDelete.room_id, videoToDelete.file_name);
    try {
      await fs.remove(filePath);
    } catch (fileError) {
      console.error('刪除文件失敗:', fileError);
    }
    
    // 更新房間數據
    await writeRooms(rooms);
    
    res.json({ success: true, message: '視頻刪除成功' });
    
  } catch (error) {
    console.error('刪除視頻錯誤:', error);
    res.status(500).json({ success: false, error: '刪除視頻失敗' });
  }
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: '視頻電視牆 API 運行正常'
  });
});

// 測試 CORS
app.get('/test', (req, res) => {
  res.json({
    message: 'CORS 測試成功',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// 根路由
app.get('/', (req, res) => {
  res.json({
    message: '🎥 視頻電視牆 API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      createRoom: 'POST /api/rooms',
      getRoom: 'GET /api/rooms/:roomId',
      uploadVideos: 'POST /api/rooms/:roomId/videos',
      deleteVideo: 'DELETE /api/videos/:videoId'
    }
  });
});

// 錯誤處理中間件
app.use((error, req, res, next) => {
  console.error('服務器錯誤:', error);
  res.status(500).json({ 
    success: false, 
    error: '服務器內部錯誤' 
  });
});

// 全局錯誤處理
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲的異常:', error);
  console.log('🔄 嘗試繼續運行...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未處理的 Promise 拒絕:', reason);
  console.log('🔄 嘗試繼續運行...');
});

// 優雅關閉處理
process.on('SIGTERM', () => {
  console.log('📡 收到 SIGTERM 信號，正在優雅關閉...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📡 收到 SIGINT 信號，正在優雅關閉...');
  process.exit(0);
});

// 啟動服務器
app.listen(port, '0.0.0.0', async () => {
  try {
    console.log(`🚀 服務器正在啟動...`);
    console.log(`📡 監聽端口: ${port}`);
    console.log(`📡 Railway PORT 環境變數: ${process.env.PORT}`);
    console.log(`🌍 環境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 綁定地址: 0.0.0.0:${port}`);
    
    await initStorage();
    
    console.log('✅ 視頻電視牆 API 已成功啟動');
    console.log(`🔗 健康檢查: http://localhost:${port}/health`);
    console.log(`🔗 外部訪問: https://videowall-production.up.railway.app/health`);
  } catch (error) {
    console.error('❌ 服務器啟動失敗:', error);
    process.exit(1);
  }
}).on('error', (error) => {
  console.error('❌ 服務器錯誤:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用`);
  }
});

module.exports = app; 
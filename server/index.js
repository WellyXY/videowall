const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const port = process.env.PORT || 3080;

// 中間件
app.use(cors());
app.use(express.json());

// 確保數據目錄存在
const DATA_DIR = path.join(__dirname, 'data');
const VIDEOS_DIR = path.join(DATA_DIR, 'videos');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

// 初始化存儲目錄
async function initStorage() {
  try {
    await fs.ensureDir(DATA_DIR);
    await fs.ensureDir(VIDEOS_DIR);
    
    // 確保 rooms.json 文件存在
    if (!await fs.pathExists(ROOMS_FILE)) {
      await fs.writeJson(ROOMS_FILE, {});
    }
    
    console.log('存儲目錄初始化完成');
  } catch (error) {
    console.error('存儲目錄初始化錯誤:', error);
  }
}

// 讀取房間數據
async function readRooms() {
  try {
    return await fs.readJson(ROOMS_FILE);
  } catch (error) {
    return {};
  }
}

// 寫入房間數據
async function writeRooms(rooms) {
  await fs.writeJson(ROOMS_FILE, rooms);
}

// 配置 multer 用於文件上傳
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const roomId = req.params.roomId;
    const roomDir = path.join(VIDEOS_DIR, roomId);
    fs.ensureDirSync(roomDir);
    cb(null, roomDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB 限制
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
app.use('/videos', express.static(VIDEOS_DIR));

// API 路由

// 創建新房間
app.post('/api/rooms', async (req, res) => {
  try {
    const { name } = req.body;
    const roomId = uuidv4();
    const roomName = name || `房間_${new Date().toLocaleString('zh-TW')}`;
    
    const rooms = await readRooms();
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      videos: []
    };
    
    await writeRooms(rooms);
    
    res.json({
      success: true,
      room: rooms[roomId]
    });
  } catch (error) {
    console.error('創建房間錯誤:', error);
    res.status(500).json({ success: false, error: '創建房間失敗' });
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
    const filePath = path.join(VIDEOS_DIR, videoToDelete.room_id, videoToDelete.file_name);
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

// 啟動服務器
app.listen(port, async () => {
  console.log(`🚀 服務器運行在端口 ${port}`);
  await initStorage();
  console.log('✅ 視頻電視牆 API 已啟動');
});

module.exports = app; 
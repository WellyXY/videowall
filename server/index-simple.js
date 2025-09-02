const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 8080;

// 內存存儲
let rooms = {};
let videos = new Map(); // 存儲視頻文件的 Buffer

// 中間件
app.use(cors());
app.use(express.json());

// 配置 multer 使用內存存儲
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB 限制
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('只允許上傳視頻文件'), false);
    }
  }
});

// 錯誤處理
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕獲異常:', error.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ 未處理 Promise:', reason);
});

// API 路由

// 創建房間
app.post('/api/rooms', (req, res) => {
  try {
    const { roomName } = req.body;
    const roomId = uuidv4();
    
    rooms[roomId] = {
      id: roomId,
      name: roomName || `房間 ${roomId.slice(0, 8)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      videos: []
    };
    
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
app.get('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;
    
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
app.post('/api/rooms/:roomId/videos', upload.array('videos', 10), (req, res) => {
  try {
    const { roomId } = req.params;
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: '沒有上傳文件' });
    }
    
    if (!rooms[roomId]) {
      return res.status(404).json({ success: false, error: '房間不存在' });
    }
    
    const currentVideos = rooms[roomId].videos || [];
    let maxOrder = currentVideos.length > 0 ? Math.max(...currentVideos.map(v => v.upload_order)) : 0;
    
    const uploadedVideos = [];
    
    files.forEach(file => {
      maxOrder++;
      const videoId = uuidv4();
      
      // 存儲視頻文件到內存
      videos.set(videoId, file.buffer);
      
      const videoInfo = {
        id: videoId,
        room_id: roomId,
        original_name: file.originalname,
        file_name: `${videoId}-${file.originalname}`,
        file_path: `/videos/${roomId}/${videoId}`,
        file_size: file.size,
        upload_order: maxOrder,
        created_at: new Date().toISOString()
      };
      
      uploadedVideos.push(videoInfo);
    });
    
    rooms[roomId].videos = [...currentVideos, ...uploadedVideos];
    rooms[roomId].updated_at = new Date().toISOString();
    
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

// 提供視頻文件
app.get('/videos/:roomId/:videoId', (req, res) => {
  try {
    const { videoId } = req.params;
    
    if (!videos.has(videoId)) {
      return res.status(404).json({ error: '視頻不存在' });
    }
    
    const videoBuffer = videos.get(videoId);
    
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Length': videoBuffer.length,
      'Accept-Ranges': 'bytes'
    });
    
    res.send(videoBuffer);
  } catch (error) {
    console.error('提供視頻文件錯誤:', error);
    res.status(500).json({ error: '提供視頻文件失敗' });
  }
});

// 刪除視頻
app.delete('/api/videos/:videoId', (req, res) => {
  try {
    const { videoId } = req.params;
    
    // 從房間中移除視頻
    let found = false;
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const videoIndex = room.videos.findIndex(v => v.id === videoId);
      if (videoIndex !== -1) {
        room.videos.splice(videoIndex, 1);
        found = true;
        break;
      }
    }
    
    if (!found) {
      return res.status(404).json({ success: false, error: '視頻不存在' });
    }
    
    // 從內存中刪除視頻文件
    videos.delete(videoId);
    
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
    message: '視頻電視牆 API 運行正常 (內存版本)',
    rooms: Object.keys(rooms).length,
    videos: videos.size
  });
});

// 根路由
app.get('/', (req, res) => {
  res.json({
    message: '🎥 視頻電視牆 API (內存版本)',
    version: '1.0.0-memory',
    status: 'running',
    rooms: Object.keys(rooms).length,
    videos: videos.size
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
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ 視頻電視牆 API (內存版本) 已啟動`);
  console.log(`📡 端口: ${port}`);
  console.log(`🌐 綁定: 0.0.0.0:${port}`);
  console.log(`💾 存儲: 內存模式`);
});

module.exports = app; 
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 中間件
app.use(cors());
app.use(express.json());

// Cloudinary 配置
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// PostgreSQL 連接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Multer 配置（內存存儲）
const storage = multer.memoryStorage();
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

// 初始化數據庫表
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
        original_name VARCHAR(255) NOT NULL,
        cloudinary_url TEXT NOT NULL,
        cloudinary_public_id VARCHAR(255) NOT NULL,
        file_size BIGINT,
        duration FLOAT,
        width INTEGER,
        height INTEGER,
        upload_order INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('數據庫表初始化完成');
  } catch (error) {
    console.error('數據庫初始化錯誤:', error);
  }
}

// API 路由

// 創建新房間
app.post('/api/rooms', async (req, res) => {
  try {
    const { name } = req.body;
    const roomName = name || `房間_${new Date().toLocaleString('zh-TW')}`;
    
    const result = await pool.query(
      'INSERT INTO rooms (name) VALUES ($1) RETURNING *',
      [roomName]
    );
    
    res.json({
      success: true,
      room: result.rows[0]
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
    
    const roomResult = await pool.query(
      'SELECT * FROM rooms WHERE id = $1',
      [roomId]
    );
    
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '房間不存在' });
    }
    
    const videosResult = await pool.query(
      'SELECT * FROM videos WHERE room_id = $1 ORDER BY upload_order ASC',
      [roomId]
    );
    
    res.json({
      success: true,
      room: roomResult.rows[0],
      videos: videosResult.rows
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
    
    // 驗證房間是否存在
    const roomCheck = await pool.query('SELECT id FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: '房間不存在' });
    }
    
    // 獲取當前最大的 upload_order
    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(upload_order), 0) as max_order FROM videos WHERE room_id = $1',
      [roomId]
    );
    let currentOrder = orderResult.rows[0].max_order;
    
    const uploadedVideos = [];
    
    // 逐個上傳視頻到 Cloudinary
    for (const file of files) {
      try {
        currentOrder++;
        
        // 上傳到 Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              resource_type: 'video',
              folder: `videowall/${roomId}`,
              use_filename: true,
              unique_filename: true,
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(file.buffer);
        });
        
        // 保存視頻信息到數據庫
        const videoResult = await pool.query(`
          INSERT INTO videos 
          (room_id, original_name, cloudinary_url, cloudinary_public_id, file_size, duration, width, height, upload_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          roomId,
          file.originalname,
          uploadResult.secure_url,
          uploadResult.public_id,
          file.size,
          uploadResult.duration,
          uploadResult.width,
          uploadResult.height,
          currentOrder
        ]);
        
        uploadedVideos.push(videoResult.rows[0]);
        
      } catch (uploadError) {
        console.error(`上傳文件 ${file.originalname} 失敗:`, uploadError);
        // 繼續處理其他文件，不中斷整個流程
      }
    }
    
    // 更新房間的更新時間
    await pool.query(
      'UPDATE rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [roomId]
    );
    
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
    
    // 獲取視頻信息
    const videoResult = await pool.query(
      'SELECT * FROM videos WHERE id = $1',
      [videoId]
    );
    
    if (videoResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: '視頻不存在' });
    }
    
    const video = videoResult.rows[0];
    
    // 從 Cloudinary 刪除視頻
    try {
      await cloudinary.uploader.destroy(video.cloudinary_public_id, { resource_type: 'video' });
    } catch (cloudinaryError) {
      console.error('從 Cloudinary 刪除視頻失敗:', cloudinaryError);
      // 繼續執行數據庫刪除，即使 Cloudinary 刪除失敗
    }
    
    // 從數據庫刪除視頻記錄
    await pool.query('DELETE FROM videos WHERE id = $1', [videoId]);
    
    res.json({ success: true, message: '視頻刪除成功' });
    
  } catch (error) {
    console.error('刪除視頻錯誤:', error);
    res.status(500).json({ success: false, error: '刪除視頻失敗' });
  }
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 啟動服務器
app.listen(port, async () => {
  console.log(`服務器運行在端口 ${port}`);
  await initDatabase();
});

module.exports = app; 
# 視頻電視牆後端 API

這是視頻電視牆應用的後端 API 服務，負責處理視頻上傳、存儲和房間管理。

## 部署到 Railway

### 1. 準備工作

1. 註冊 [Railway](https://railway.app) 帳號
2. 註冊 [Cloudinary](https://cloudinary.com) 帳號（免費額度足夠測試使用）

### 2. 部署步驟

1. **在 Railway 中創建新項目**
   - 登入 Railway 控制台
   - 點擊 "New Project"
   - 選擇 "Deploy from GitHub repo"
   - 選擇您的 `videowall` 倉庫
   - 選擇 `server` 目錄作為根目錄

2. **添加 PostgreSQL 數據庫**
   - 在項目中點擊 "Add Service"
   - 選擇 "PostgreSQL"
   - Railway 會自動創建數據庫並設置 `DATABASE_URL` 環境變數

3. **配置環境變數**
   在 Railway 項目設置中添加以下環境變數：
   ```
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   NODE_ENV=production
   ```

4. **獲取 Cloudinary 配置**
   - 登入 [Cloudinary 控制台](https://cloudinary.com/console)
   - 在 Dashboard 頁面找到 "Account Details"
   - 複製 Cloud Name, API Key 和 API Secret

5. **部署完成**
   - Railway 會自動構建和部署您的應用
   - 獲取生成的 URL（類似：`https://your-app-name.railway.app`）

### 3. 更新前端配置

部署完成後，需要更新前端文件中的 API_BASE_URL：

1. 編輯 `index.html` 和 `video-wall.html`
2. 將 `API_BASE_URL` 更改為您的 Railway 應用 URL：
   ```javascript
   const API_BASE_URL = 'https://your-app-name.railway.app';
   ```

## API 端點

- `POST /api/rooms` - 創建新房間
- `GET /api/rooms/:roomId` - 獲取房間信息
- `POST /api/rooms/:roomId/videos` - 上傳視頻到房間
- `DELETE /api/videos/:videoId` - 刪除視頻
- `GET /health` - 健康檢查

## 本地開發

1. 安裝依賴：
   ```bash
   npm install
   ```

2. 創建 `.env` 文件並配置環境變數

3. 啟動開發服務器：
   ```bash
   npm run dev
   ```

## 注意事項

- Cloudinary 免費額度：每月 25GB 存儲空間和 25GB 帶寬
- Railway 免費額度：每月 500 小時運行時間
- 視頻文件大小限制：100MB（可在代碼中調整）
- 支持的視頻格式：所有瀏覽器支持的格式（MP4, WebM, OGV 等） 
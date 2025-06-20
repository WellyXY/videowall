# 視頻電視牆 (Video Wall)

一個現代化的視頻電視牆應用，支持多種視頻格式的上傳、播放和分享。

## 功能特點

- 🎥 支持多種視頻格式上傳
- 📱 響應式設計，自動適應不同螢幕尺寸
- 🔄 智能長寬比適應（支持 16:9、4:3、3:4 等比例）
- 🎛️ 豐富的播放控制（播放/暫停、靜音、速度調整）
- 📊 視頻選擇統計功能
- 🔗 雲端分享功能
- ⚡ 動態佈局調整

## 技術棧

- **前端**: HTML5, CSS3, JavaScript (原生)
- **部署**: Vercel
- **後端**: Node.js + Express (Railway)
- **數據庫**: PostgreSQL
- **文件存儲**: Cloudinary

## 本地開發

1. 克隆倉庫：
```bash
git clone https://github.com/WellyXY/videowall.git
cd videowall
```

2. 直接打開 `video-wall.html` 即可在瀏覽器中使用

## 雲端部署

### 前端部署到 Vercel

1. 將代碼推送到 GitHub
2. 在 Vercel 中導入此倉庫
3. 自動部署完成

### 後端部署到 Railway

詳見 `server/` 目錄中的部署說明。

## 使用方法

1. 上傳視頻文件
2. 調整佈局設置（每行視頻數量、長寬比）
3. 使用播放控制功能
4. 生成分享鏈接給其他人

## 貢獻

歡迎提交 Issue 和 Pull Request！

## 授權

MIT License 
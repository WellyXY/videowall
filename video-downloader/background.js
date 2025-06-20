chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download_video') {
        if (request.url) {
            // 從URL中提取文件名
            let filename = 'video';
            try {
                const url = new URL(request.url);
                const pathname = url.pathname;
                const segments = pathname.split('/');
                const lastSegment = segments[segments.length - 1];
                
                if (lastSegment && lastSegment.includes('.')) {
                    filename = lastSegment;
                } else {
                    // 如果沒有文件擴展名，添加.mp4
                    filename = `video_${Date.now()}.mp4`;
                }
            } catch (error) {
                filename = `video_${Date.now()}.mp4`;
            }

            const downloadOptions = {
                url: request.url,
                filename: filename
            };

            chrome.downloads.download(downloadOptions, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error('下載失敗:', chrome.runtime.lastError.message);
                    sendResponse({ status: 'failed', error: chrome.runtime.lastError.message });
                } else if (downloadId) {
                    console.log('下載開始，ID:', downloadId);
                    sendResponse({ status: 'success', downloadId: downloadId });
                } else {
                    console.log('下載被取消');
                    sendResponse({ status: 'cancelled', error: 'Download was cancelled' });
                }
            });
            
            return true; 
        } else {
            console.error('下載請求沒有提供URL');
            sendResponse({ status: 'failed', error: 'No URL provided' });
        }
    }
}); 
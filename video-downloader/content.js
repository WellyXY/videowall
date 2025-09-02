function getVideoData() {
    const videos = Array.from(document.querySelectorAll('video'));
    const videoData = [];
    
    videos.forEach(video => {
        let videoUrl = null;
        
        // 首先檢查video元素的src屬性
        if (video.src && !video.src.startsWith('blob:') && !video.src.startsWith('data:')) {
            videoUrl = video.src;
        }
        
        // 如果沒有src，檢查source子元素
        if (!videoUrl) {
            const sources = video.querySelectorAll('source');
            for (const source of sources) {
                if (source.src && !source.src.startsWith('blob:') && !source.src.startsWith('data:')) {
                    videoUrl = source.src;
                    break;
                }
            }
        }
        
        // 如果找到了有效的視頻URL
        if (videoUrl) {
            try {
                // 將相對 URL 轉換為絕對 URL
                const absoluteUrl = new URL(videoUrl, window.location.href).href;
                
                videoData.push({
                    src: absoluteUrl,
                    poster: video.poster ? new URL(video.poster, window.location.href).href : null,
                    duration: video.duration || 0,
                });
            } catch (error) {
                console.error('Invalid video URL:', videoUrl, error);
            }
        }
    });

    // 額外檢查：尋找其他可能的視頻元素（如iframe中的視頻）
    const iframes = Array.from(document.querySelectorAll('iframe'));
    iframes.forEach(iframe => {
        try {
            if (iframe.src && (iframe.src.includes('youtube.com') || iframe.src.includes('vimeo.com'))) {
                // 這裡可以添加對YouTube、Vimeo等嵌入視頻的支持
                // 但由於CORS限制，我們暫時跳過iframe內容
            }
        } catch (error) {
            // 忽略跨域錯誤
        }
    });

    return videoData;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'get_videos') {
        const videos = getVideoData();
        console.log('Found videos:', videos); // 調試日志
        sendResponse(videos);
    }
}); 
document.addEventListener('DOMContentLoaded', () => {
    const videoList = document.getElementById('video-list');
    const downloadAllBtn = document.getElementById('download-all-btn');
    let detectedVideos = [];

    // Function to format seconds into HH:MM:SS
    function formatDuration(seconds) {
        if (isNaN(seconds) || seconds < 0) {
            return '00:00';
        }
        const date = new Date(0);
        date.setSeconds(seconds);
        const timeString = date.toISOString().substr(11, 8);
        return timeString.startsWith('00:') ? timeString.substr(3) : timeString;
    }

    // Function to download a single video
    function downloadVideo(videoUrl, button) {
        button.textContent = '下載中...';
        button.disabled = true;
        
        chrome.runtime.sendMessage({ 
            action: 'download_video', 
            url: videoUrl,
            saveAs: false
        }, (response) => {
            if (response && response.status === 'success') {
                button.textContent = '✅ 已開始';
            } else {
                button.textContent = '❌ 失敗';
                button.disabled = false;
            }
        });
    }

    // 批量下載函數
    function downloadAllVideos() {
        if (detectedVideos.length === 0) return;

        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = '下載中...';

        let completed = 0;
        let failed = 0;
        const total = detectedVideos.length;

        detectedVideos.forEach((video, index) => {
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    action: 'download_video',
                    url: video.src,
                    saveAs: false
                }, (response) => {
                    completed++;
                    if (!response || response.status !== 'success') {
                        failed++;
                    }

                    // 更新進度
                    downloadAllBtn.textContent = `下載中... (${completed}/${total})`;

                    // 全部完成
                    if (completed === total) {
                        if (failed === 0) {
                            downloadAllBtn.textContent = '✅ 全部完成';
                        } else {
                            downloadAllBtn.textContent = `⚠️ 完成 (${failed} 個失敗)`;
                        }
                        
                        setTimeout(() => {
                            downloadAllBtn.textContent = '📥 一鍵下載全部';
                            downloadAllBtn.disabled = false;
                        }, 3000);
                    }
                });
            }, index * 500); // 每500ms下載一個
        });
    }

    // Add event listener for download all button
    downloadAllBtn.addEventListener('click', downloadAllVideos);

    // Query the active tab and send a message to the content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
            videoList.innerHTML = '<p>❌ 無法訪問當前頁面。</p>';
            return;
        }

        // First, inject the content script
        chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
        }, (results) => {
            if (chrome.runtime.lastError) {
                videoList.innerHTML = '<p>❌ 無法注入內容腳本。請確保頁面已完全加載。</p>';
                return;
            }

            // After the script is injected, send a message to it
            chrome.tabs.sendMessage(activeTab.id, { action: 'get_videos' }, (response) => {
                if (chrome.runtime.lastError) {
                    videoList.innerHTML = '<p>❌ 無法與頁面通信。<br>請刷新頁面後再試。</p>';
                    return;
                }

                if (response && Array.isArray(response) && response.length > 0) {
                    detectedVideos = response;
                    downloadAllBtn.disabled = false;
                    
                    videoList.innerHTML = '';
                    response.forEach((video, index) => {
                        const videoItem = document.createElement('div');
                        videoItem.className = 'video-item';

                        videoItem.innerHTML = `
                            <div class="thumbnail-container">
                                <img src="${video.poster || ''}" alt="視頻縮略圖" class="video-thumbnail" 
                                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                                     onload="this.nextElementSibling.style.display='none';">
                                <div class="video-thumbnail error" style="display: none;">無縮略圖</div>
                            </div>
                            <div class="video-info">
                                <div class="video-url" title="${video.src}" style="font-size: 11px; color: #666; margin-bottom: 5px; word-break: break-all;">${video.src.length > 50 ? video.src.substring(0, 50) + '...' : video.src}</div>
                                <div class="video-duration">時長: ${formatDuration(video.duration)}</div>
                            </div>
                            <button class="download-btn" data-url="${video.src}">下載</button>
                        `;
                        videoList.appendChild(videoItem);
                    });

                    // Add event listeners to download buttons
                    document.querySelectorAll('.download-btn').forEach(button => {
                        button.addEventListener('click', (event) => {
                            const videoUrl = event.target.getAttribute('data-url');
                            downloadVideo(videoUrl, event.target);
                        });
                    });

                } else {
                    videoList.innerHTML = '<p>🔍 此頁面未檢測到可下載的視頻。</p>';
                }
            });
        });
    });
}); 
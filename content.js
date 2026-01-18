class BiliAnalyzer {
  constructor() {
    this.currentBvid = '';
    this.currentScene = '';
    this.exportButton = null;
    this.analyzeButton = null;
    this.modal = null;
    this.lastUrl = '';
    
    this.stopWords = new Set([
      '的', '了', '是', '和', '在', '视频', '教程', '[', ']', '(', ')', '(', ')', 
      ',', '.', '!', '?', '/', ':', ';', '"', '"', "'", "'", ' ', '\t', '\n',
      '一个', '这个', '那个', '可以', '如何', '什么', '没有', '进行', '使用', '实现',
      '学习', '分享', '讲解', '演示', '制作', '开发', '编程', '代码', '项目', '实战',
      '入门', '进阶', '基础', '高级', '完整', '详细', '全面', '系列', '课程', '教学',
      '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十',
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '一', '二', '三', '四', '五',
      '六', '七', '八', '九', '十', '零', '百', '千', '万', '亿'
    ]);
    
    this.segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
  }

  // 主路由检查函数
  routerCheck() {
    const currentUrl = window.location.href;
    
    // 如果URL没有变化，跳过检查
    if (currentUrl === this.lastUrl) {
      return;
    }
    
    this.lastUrl = currentUrl;
    const url = new URL(currentUrl);
    const pathname = url.pathname;
    const searchParams = url.searchParams;
    const hash = url.hash;
    
    console.log('Router check:', { pathname, searchParams: [...searchParams], hash });
    
    // 场景1：稍后再看播放页 -> “转普通页”按钮
    if (pathname.includes('/list/watchlater') && searchParams.has('bvid')) {
      const bvid = searchParams.get('bvid');
      this.handleWatchLaterPlayerScene(bvid);
      return;
    }
    
    // 场景2：稍后再看列表管理页 -> “分析标题”按钮
    if ((pathname.includes('/watchlater/list') || hash.includes('#/list')) && !searchParams.has('bvid')) {
      this.handleWatchLaterListScene();
      return;
    }
    
    // 场景3：历史记录页 -> “分析近期”按钮
    if (pathname.includes('/history')) {
      this.handleHistoryScene();
      return;
    }
    
    // 其他页面，隐藏所有按钮
    this.hideAllButtons();
    this.currentScene = 'unknown';
  }

  // 场景1：稍后再看播放页
  handleWatchLaterPlayerScene(bvid) {
    console.log('Watch Later Player Scene detected, bvid:', bvid);
    
    this.currentScene = 'watchlater_player';
    this.currentBvid = bvid;
    
    // 显示转普通页按钮
    this.createExportButton();
    this.exportButton.classList.add('visible');
    
    // 隐藏分析按钮
    if (this.analyzeButton) {
      this.analyzeButton.classList.remove('visible');
    }
  }

  // 场景2：稍后再看列表管理页
  handleWatchLaterListScene() {
    console.log('Watch Later List Scene detected');
    
    this.currentScene = 'watchlater_list';
    this.currentBvid = '';
    
    // 隐藏转普通页按钮
    if (this.exportButton) {
      this.exportButton.classList.remove('visible');
    }
    
    // 显示分析标题按钮
    this.createAnalyzeButton('📊 分析标题');
    this.analyzeButton.classList.add('visible');
  }

  // 场景3：历史记录页
  handleHistoryScene() {
    console.log('History Scene detected');
    
    this.currentScene = 'history';
    this.currentBvid = '';
    
    // 隐藏转普通页按钮
    if (this.exportButton) {
      this.exportButton.classList.remove('visible');
    }
    
    // 显示分析近期按钮
    this.createAnalyzeButton('📊 分析近期');
    this.analyzeButton.classList.add('visible');
  }

  // 创建转普通页按钮
  createExportButton() {
    // 检查按钮是否已存在
    if (this.exportButton) {
      return;
    }

    this.exportButton = document.createElement('button');
    this.exportButton.id = 'my-bilibili-extension-btn';
    this.exportButton.className = 'bili-exporter-btn';
    this.exportButton.textContent = '转普通页';
    this.exportButton.addEventListener('click', () => this.handleExportButtonClick());
    document.body.appendChild(this.exportButton);
  }

  // 创建分析按钮
  createAnalyzeButton(text) {
    // 检查按钮是否已存在
    if (this.analyzeButton) {
      // 如果按钮已存在，只需更新文本
      this.analyzeButton.textContent = text;
      return;
    }

    this.analyzeButton = document.createElement('button');
    this.analyzeButton.id = 'my-bilibili-extension-analyze-btn';
    this.analyzeButton.className = 'bili-analyze-btn';
    this.analyzeButton.textContent = text;
    this.analyzeButton.addEventListener('click', () => this.handleAnalyzeButtonClick());
    document.body.appendChild(this.analyzeButton);
  }

  // 隐藏所有按钮
  hideAllButtons() {
    if (this.exportButton) {
      this.exportButton.classList.remove('visible');
    }
    if (this.analyzeButton) {
      this.analyzeButton.classList.remove('visible');
    }
  }

  // 转普通页按钮点击事件
  handleExportButtonClick() {
    if (this.currentBvid) {
      const targetUrl = `https://www.bilibili.com/video/${this.currentBvid}`;
      window.open(targetUrl, '_blank');
    }
  }

  // 分析按钮点击事件
  async handleAnalyzeButtonClick() {
    if (!this.modal) {
      this.createModal();
    }
    
    this.modal.classList.add('visible');
    
    const modalBody = this.modal.querySelector('.bili-modal-body');
    modalBody.innerHTML = '<div class="bili-loading">正在读取B站数据...</div>';
    
    try {
      const data = await this.fetchData();
      if (data.titles && data.titles.length > 0) {
        const results = this.analyzeTitles(data.titles);
        this.renderAnalysisResults(results, data.videos);
      } else {
        modalBody.innerHTML = '<div class="bili-error">未找到近期记录</div>';
      }
    } catch (error) {
      modalBody.innerHTML = `<div class="bili-error">获取数据失败：${error.message}</div>`;
    }
  }

  // 根据当前场景获取数据
  async fetchData() {
    if (this.currentScene === 'history') {
      const videos = await this.fetchHistoryData();
      return {
        titles: videos.map(v => v.title),
        videos: videos
      };
    } else if (this.currentScene === 'watchlater_list') {
      const videos = await this.fetchWatchLaterData();
      return {
        titles: videos.map(v => v.title),
        videos: videos
      };
    }
    return { titles: [], videos: [] };
  }

  // 通用请求函数，强制携带Cookie
  async fetchBilibiliData(url) {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'include'
    });
    const json = await response.json();
    console.log(`[BiliExtension] 请求: ${url}`, json);
    return json;
  }

  // 获取稍后再看数据
  async fetchWatchLaterData() {
    const data = await this.fetchBilibiliData('https://api.bilibili.com/x/v2/history/toview');
    
    if (data.code !== 0) {
      if (data.code === -101) {
        throw new Error('B站服务器认为您未登录，请刷新页面重试');
      }
      throw new Error(data.message || '获取数据失败');
    }
    
    if (!data.data || !data.data.list || data.data.list.length === 0) {
      throw new Error('稍后再看列表为空');
    }
    
    return data.data.list.map(item => ({
      title: item.title,
      bvid: item.bvid
    }));
  }

  // 获取历史记录数据
  async fetchHistoryData() {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const videos = [];
    let viewAt = null;
    let pageCount = 0;
    const maxPages = 5;

    while (pageCount < maxPages) {
      const url = new URL('https://api.bilibili.com/x/web-interface/history/cursor');
      url.searchParams.set('ps', '30');
      if (viewAt) {
        url.searchParams.set('view_at', viewAt);
      }

      const data = await this.fetchBilibiliData(url.toString());

      if (data.code !== 0) {
        if (data.code === -101) {
          throw new Error('B站服务器认为您未登录，请刷新页面重试');
        }
        break;
      }

      if (!data.data || !data.data.list || data.data.list.length === 0) {
        break;
      }

      const list = data.data.list;
      let shouldContinue = false;

      for (const item of list) {
        const viewTime = item.view_at * 1000;
        
        if (viewTime < threeDaysAgo) {
          shouldContinue = false;
          break;
        }

        if (item.title && item.badge === '') {
          videos.push({
            title: item.title,
            bvid: item.bvid || item.history?.bvid,
            view_at: item.view_at
          });
        }

        shouldContinue = true;
        viewAt = item.view_at;
      }

      if (!shouldContinue || !data.data.cursor) {
        break;
      }

      pageCount++;
      viewAt = data.data.cursor;
    }

    return videos;
  }

  // 分析标题，统计词频
  analyzeTitles(titles) {
    const wordCount = new Map();
    
    titles.forEach(title => {
      const segments = this.segmenter.segment(title);
      for (const segment of segments) {
        const word = segment.segment.trim();
        
        if (word.length > 1 && !this.stopWords.has(word) && /^[\u4e00-\u9fa5a-zA-Z0-9]+$/.test(word)) {
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        }
      }
    });
    
    const sortedWords = Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    
    return sortedWords;
  }

  // 渲染分析结果
  renderAnalysisResults(results, videos) {
    const modalBody = this.modal.querySelector('.bili-modal-body');
    
    if (results.length === 0 && videos.length === 0) {
      modalBody.innerHTML = '<div class="bili-error">没有找到有效数据</div>';
      return;
    }

    let html = '';

    if (results.length > 0) {
      const maxCount = results[0][1];
      html += `
        <div class="bili-section">
          <h4 class="bili-section-title">高频关键词</h4>
          <div class="bili-analysis-results">
            ${results.map(([word, count], index) => {
              const percentage = (count / maxCount) * 100;
              return `
                <div class="bili-result-item" style="animation-delay: ${index * 0.03}s">
                  <div class="bili-result-word">${word}</div>
                  <div class="bili-result-bar">
                    <div class="bili-result-bar-fill" style="width: ${percentage}%"></div>
                  </div>
                  <div class="bili-result-count">${count}次</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (videos.length > 0) {
      html += `
        <div class="bili-section">
          <h4 class="bili-section-title">视频列表 (${videos.length}个)</h4>
          <div class="bili-video-list">
            ${videos.map((video, index) => {
              const bvid = video.bvid;
              const date = new Date(video.view_at * 1000);
              const timeStr = date.toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              });
              const timeHtml = video.view_at ? `<div class="bili-video-time">${timeStr}</div>` : '';
              return `
                <div class="bili-video-item" style="animation-delay: ${index * 0.02}s">
                  <div class="bili-video-title" data-bvid="${bvid}">${video.title} <span class="bili-video-link-icon">🔗</span></div>
                  ${timeHtml}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    modalBody.innerHTML = html;

    const videoTitles = modalBody.querySelectorAll('.bili-video-title');
    videoTitles.forEach(title => {
      title.addEventListener('click', () => {
        const bvid = title.getAttribute('data-bvid');
        if (bvid) {
          window.open(`https://www.bilibili.com/video/${bvid}`, '_blank');
        }
      });
    });
  }

  // 创建模态框
  createModal() {
    if (this.modal) {
      return;
    }

    this.modal = document.createElement('div');
    this.modal.className = 'bili-modal-overlay';
    
    const title = this.currentScene === 'history' 
      ? '历史记录 - 近期观看统计' 
      : '稍后再看 - 你的关注点统计';
      
    this.modal.innerHTML = `
      <div class="bili-modal-content">
        <div class="bili-modal-header">
          <h3>${title}</h3>
          <button class="bili-modal-close">&times;</button>
        </div>
        <div class="bili-modal-body">
          <div class="bili-loading">加载中...</div>
        </div>
        <div class="bili-modal-footer">
          <button class="bili-modal-close-btn">关闭</button>
        </div>
      </div>
    `;

    const closeButtons = this.modal.querySelectorAll('.bili-modal-close, .bili-modal-close-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.closeModal());
    });

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });

    document.body.appendChild(this.modal);
  }

  // 关闭模态框
  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('visible');
    }
  }

  // 初始化
  init() {
    console.log('BiliAnalyzer initialized');
    
    // 初始检查
    this.routerCheck();
    
    // 每1秒检查一次URL变化
    setInterval(() => {
      this.routerCheck();
    }, 1000);
  }
}

// 初始化扩展
let analyzer = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    analyzer = new BiliAnalyzer();
    analyzer.init();
  });
} else {
  analyzer = new BiliAnalyzer();
  analyzer.init();
}
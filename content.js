class BiliAnalyzer {
  constructor() {
    this.currentBvid = '';
    this.currentScene = '';
    this.exportButton = null;
    this.analyzeButton = null;
    this.modal = null;
    this.lastUrl = '';
    this.originalVideos = [];
    this.currentFilterKeyword = null;
    
    this.stopWords = new Set([
      '的', '了', '是', '和', '在', '视频', '教程', '[', ']', '(', ')', '(', ')', 
      ',', '.', '!', '?', '/', ':', ';', '"', '"', "'", "'", ' ', '\t', '\n',
      '一个', '这个', '那个', '可以', '如何', '什么', '没有', '进行', '使用', '实现',
      '学习', '分享', '讲解', '演示', '制作', '开发',  '代码', '项目', '实战',
      '入门', '进阶', '基础', '高级', '完整', '详细', '全面', '系列', '课程', '教学',
      '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十',
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '一', '二', '三', '四', '五',
      '六', '七', '八', '九', '十', '零', '百', '千', '万', '亿',
      '我们', '到了', '真的', '大家', '都会', '真的', '这么', '一下', '差一点', '再打', '以为', '放大',
      '超全', '巨细', '贼香', '爆爽', '绝了', '太绝', '超赞', '巨牛', '贼强', '爆燃', '超燃', '巨燃',
      '贼燃', '绝燃', '太燃', '超爽', '巨爽', '贼爽', '绝爽', '太爽', '超神', '巨神', '贼神', '绝神',
      '太神', '超稳', '巨稳', '贼稳', '绝稳', '太稳', '超秀', '巨秀', '贼秀', '绝秀', '太秀', '超顶',
      '巨顶', '贼顶', '绝顶', '太顶', '超炸', '巨炸', '贼炸', '绝炸', '太炸', '超猛', '巨猛', '贼猛',
      '绝猛', '太猛', '超酷', '巨酷', '贼酷', '绝酷', '太酷', '超炫', '巨炫', '贼炫', '绝炫', '太炫',
      '超飒', '巨飒', '贼飒', '绝飒', '太飒', '超 A', '巨 A', '贼 A', '绝 A', '太 A', '超甜', '巨甜',
      '贼甜', '绝甜', '太甜', '超虐', '巨虐', '贼虐', '绝虐', '太虐', '超萌', '巨萌', '贼萌', '绝萌',
      '太萌', '超可爱', '巨可爱', '贼可爱', '绝可爱', '太可爱'
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
    document.body.style.overflow = 'hidden';
    
    const modalBody = this.modal.querySelector('.bili-modal-body');
    modalBody.innerHTML = '<div class="bili-loading">正在读取B站数据...</div>';
    
    try {
      const data = await this.fetchData();
      if (data.titles && data.titles.length > 0) {
        const results = await this.analyzeTitles(data.titles);
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
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
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
        
        if (viewTime < fiveDaysAgo) {
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

  // 分析标题，统计词频（支持自定义词库）
  async analyzeTitles(titles) {
    const wordCount = new Map();
    
    const { blockedWords = [], userPhrases = [] } = await this.getUserConfig();
    const blockedSet = new Set(blockedWords);
    const phraseSet = new Set(userPhrases);
    
    titles.forEach(title => {
      let processedTitle = title;
      
      if (phraseSet.size > 0) {
        phraseSet.forEach(phrase => {
          const regex = new RegExp(this.escapeRegExp(phrase), 'g');
          const matches = processedTitle.match(regex);
          if (matches) {
            wordCount.set(phrase, (wordCount.get(phrase) || 0) + matches.length);
            processedTitle = processedTitle.replace(regex, ' ');
          }
        });
      }
      
      const segments = this.segmenter.segment(processedTitle);
      for (const segment of segments) {
        const word = segment.segment.trim();
        
        if (word.length > 1 && 
            !this.stopWords.has(word) && 
            !blockedSet.has(word) &&
            !phraseSet.has(word) &&
            /^[\u4e00-\u9fa5a-zA-Z0-9]+$/.test(word)) {
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        }
      }
    });
    
    const sortedWords = Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1]);
    
    return sortedWords;
  }
  
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  async getUserConfig() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['blockedWords', 'userPhrases'], (result) => {
          resolve({
            blockedWords: result.blockedWords || [],
            userPhrases: result.userPhrases || []
          });
        });
      } else {
        resolve({ blockedWords: [], userPhrases: [] });
      }
    });
  }
  
  saveUserConfig(blockedWords, userPhrases) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ blockedWords, userPhrases });
    }
  }

  // 渲染分析结果
  async renderAnalysisResults(results, videos) {
    const modalBody = this.modal.querySelector('.bili-modal-body');
    
    if (results.length === 0 && videos.length === 0) {
      modalBody.innerHTML = '<div class="bili-error">没有找到有效数据</div>';
      return;
    }

    this.originalVideos = videos;
    this.currentFilterKeyword = null;

    const displayLimit = 30;
    const showExpandButton = results.length > displayLimit;
    const displayedResults = results.slice(0, displayLimit);

    const maxCount = results.length > 0 ? results[0][1] : 1;

    const keywordsHtml = results.length > 0 ? `
      <div class="bili-keywords-section">
        <div class="bili-keywords-header">
          <h4 class="bili-section-title">高频关键词</h4>
          ${showExpandButton ? `<button class="bili-expand-btn" id="bili-expand-btn">展开更多 ▼</button>` : ''}
        </div>
        <div class="bili-analysis-results" id="bili-keywords-list">
          ${displayedResults.map(([word, count], index) => {
            const percentage = (count / maxCount) * 100;
            return `
              <div class="bili-result-item" style="animation-delay: ${index * 0.03}s">
                <div class="bili-result-word" data-keyword="${word}">${word}</div>
                <div class="bili-result-bar">
                  <div class="bili-result-bar-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="bili-result-count">${count}次</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '';

    modalBody.innerHTML = `
      <div class="bili-modal-layout">
        <div class="bili-left-panel">
          ${keywordsHtml}
        </div>
        <div class="bili-right-panel">
          <div class="bili-videos-section">
            <h4 class="bili-section-title">视频列表 (${videos.length}个)</h4>
            <div class="bili-video-list" id="bili-video-list"></div>
          </div>
        </div>
      </div>
    `;

    this.renderVideoList(videos);

    const keywordElements = modalBody.querySelectorAll('.bili-result-word');
    keywordElements.forEach(keywordElement => {
      const keyword = keywordElement.getAttribute('data-keyword');
      keywordElement.addEventListener('dblclick', () => {
        this.toggleKeywordFilter(keyword);
      });
    });

    const expandBtn = modalBody.querySelector('#bili-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        const keywordsList = modalBody.querySelector('#bili-keywords-list');
        const allResults = results.map(([word, count], index) => {
          const percentage = (count / maxCount) * 100;
          return `
            <div class="bili-result-item" style="animation-delay: ${index * 0.03}s">
              <div class="bili-result-word" data-keyword="${word}">${word}</div>
              <div class="bili-result-bar">
                <div class="bili-result-bar-fill" style="width: ${percentage}%"></div>
              </div>
              <div class="bili-result-count">${count}次</div>
            </div>
          `;
        }).join('');
        keywordsList.innerHTML = allResults;
        expandBtn.style.display = 'none';

        const newKeywordElements = keywordsList.querySelectorAll('.bili-result-word');
        newKeywordElements.forEach(keywordElement => {
          const keyword = keywordElement.getAttribute('data-keyword');
          keywordElement.addEventListener('dblclick', () => {
            this.toggleKeywordFilter(keyword);
          });
        });
      });
    }
  }

  toggleKeywordFilter(keyword) {
    if (this.currentFilterKeyword === keyword) {
      this.currentFilterKeyword = null;
      this.renderVideoList(this.originalVideos);
      this.updateKeywordHighlight(null);
    } else {
      this.currentFilterKeyword = keyword;
      const filteredVideos = this.originalVideos.filter(video => 
        video.title.includes(keyword)
      );
      this.renderVideoList(filteredVideos);
      this.updateKeywordHighlight(keyword);
    }
  }

  renderVideoList(videos) {
    const videoListContainer = this.modal.querySelector('#bili-video-list');
    videoListContainer.innerHTML = '';

    if (videos.length === 0) {
      videoListContainer.innerHTML = '<div class="bili-empty-state">暂无相关视频</div>';
      return;
    }

    videos.forEach((video, index) => {
      const bvid = video.bvid;
      const date = new Date(video.view_at * 1000);
      const timeStr = date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      const timeHtml = video.view_at ? `<div class="bili-video-time">${timeStr}</div>` : '';
      
      const videoItem = document.createElement('div');
      videoItem.className = 'bili-video-item';
      videoItem.style.animationDelay = `${index * 0.02}s`;
      videoItem.innerHTML = `
        <div class="bili-video-title" data-bvid="${bvid}">${video.title} <span class="bili-video-link-icon">🔗</span></div>
        ${timeHtml}
      `;
      
      const videoTitle = videoItem.querySelector('.bili-video-title');
      videoTitle.addEventListener('click', () => {
        if (bvid) {
          window.open(`https://www.bilibili.com/video/${bvid}`, '_blank');
        }
      });
      
      videoListContainer.appendChild(videoItem);
    });
  }

  updateKeywordHighlight(keyword) {
    const keywordElements = this.modal.querySelectorAll('.bili-result-word');
    keywordElements.forEach(keywordElement => {
      keywordElement.classList.remove('bili-keyword-selected');
    });
    
    if (keyword) {
      const targetElement = this.modal.querySelector(`.bili-result-word[data-keyword="${keyword}"]`);
      if (targetElement) {
        targetElement.classList.add('bili-keyword-selected');
      }
    }
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
          <div class="bili-modal-header-actions">
            <button class="bili-config-btn" id="bili-config-btn">
              <span>⚙️</span>
              <span>自定义配置</span>
            </button>
            <button class="bili-modal-close">&times;</button>
          </div>
        </div>
        <div class="bili-modal-body">
          <div class="bili-loading">加载中...</div>
        </div>
        <div class="bili-modal-footer">
          <span class="bili-author-credit">Designed by 扎导ZhaDa0</span>
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

    const configBtn = this.modal.querySelector('#bili-config-btn');
    if (configBtn) {
      configBtn.addEventListener('click', () => this.openConfigModal());
    }

    document.body.appendChild(this.modal);
  }

  // 关闭模态框
  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('visible');
      document.body.style.overflow = '';
      this.originalVideos = [];
      this.currentFilterKeyword = null;
    }
  }

  // 打开配置子模态框
  async openConfigModal() {
    if (this.configModal) {
      this.configModal.classList.add('visible');
      return;
    }

    const { blockedWords = [], userPhrases = [] } = await this.getUserConfig();

    this.configModal = document.createElement('div');
    this.configModal.className = 'bili-submodal-overlay';
    
    this.configModal.innerHTML = `
      <div class="bili-submodal-content">
        <div class="bili-submodal-header">
          <h3>自定义配置</h3>
          <button class="bili-modal-close">&times;</button>
        </div>
        <div class="bili-submodal-body">
          <div class="bili-config-section">
            <div class="bili-config-item">
              <label class="bili-config-label">屏蔽词（用逗号分隔）</label>
              <textarea class="bili-config-textarea" id="bili-blocked-words" placeholder="例如：我们,99,II">${blockedWords.join(',')}</textarea>
            </div>
            <div class="bili-config-item">
              <label class="bili-config-label">自定义短语（用逗号分隔）</label>
              <textarea class="bili-config-textarea" id="bili-user-phrases" placeholder="例如：明日方舟,原神">${userPhrases.join(',')}</textarea>
            </div>
          </div>
        </div>
        <div class="bili-submodal-footer">
          <button class="bili-submodal-btn bili-submodal-btn-cancel" id="bili-config-cancel-btn">取消</button>
          <button class="bili-submodal-btn bili-submodal-btn-save" id="bili-config-save-btn">保存</button>
        </div>
      </div>
    `;

    const closeButtons = this.configModal.querySelectorAll('.bili-modal-close, #bili-config-cancel-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.closeConfigModal());
    });

    this.configModal.addEventListener('click', (e) => {
      if (e.target === this.configModal) {
        this.closeConfigModal();
      }
    });

    const saveBtn = this.configModal.querySelector('#bili-config-save-btn');
    saveBtn.addEventListener('click', () => this.saveConfigAndRefresh());

    document.body.appendChild(this.configModal);
    
    setTimeout(() => {
      this.configModal.classList.add('visible');
    }, 10);
  }

  // 关闭配置子模态框
  closeConfigModal() {
    if (this.configModal) {
      this.configModal.classList.remove('visible');
    }
  }

  // 保存配置并刷新
  async saveConfigAndRefresh() {
    const blockedWordsInput = this.configModal.querySelector('#bili-blocked-words').value;
    const userPhrasesInput = this.configModal.querySelector('#bili-user-phrases').value;
    
    const newBlockedWords = blockedWordsInput.split(',').map(w => w.trim()).filter(w => w);
    const newUserPhrases = userPhrasesInput.split(',').map(p => p.trim()).filter(p => p);
    
    this.saveUserConfig(newBlockedWords, newUserPhrases);
    
    this.closeConfigModal();
    
    const modalBody = this.modal.querySelector('.bili-modal-body');
    modalBody.innerHTML = '<div class="bili-loading">正在重新分析...</div>';
    
    try {
      const data = await this.fetchData();
      if (data.titles && data.titles.length > 0) {
        const results = await this.analyzeTitles(data.titles);
        this.renderAnalysisResults(results, data.videos);
      } else {
        modalBody.innerHTML = '<div class="bili-error">未找到近期记录</div>';
      }
    } catch (error) {
      modalBody.innerHTML = `<div class="bili-error">获取数据失败：${error.message}</div>`;
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
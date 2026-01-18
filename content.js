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
    this.isCaseSensitive = false;
    this.userDefinedWords = new Set();
    
    this.stopWords = new Set([
      '的', '了', '是', '和', '在', '视频', '教程', '[', ']', '(', ')', '(', ')', 
      ',', '.', '!', '?', '/', ':', ';', '"', '"', "'", "'", ' ', '\t', '\n',
      '一个', '这个', '那个', '可以', '如何', '什么', '没有', '进行', '使用', '实现',
      '学习', '分享', '讲解', '演示', '制作', '开发',  '代码', '项目', '实战',
      '入门', '进阶', '基础', '高级', '完整', '详细', '全面', '系列', '课程', '教学',
      '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十',
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '一', '二', '三', '四', '五',
      '六', '七', '八', '九', '十', '零', '百', '千', '万', '亿',
      '我们', '到了', '真的', '大家', '都会', '真的', '这么', '一下', '差一点', '再打', '以为', '放大', '分钟', '小时', '你的', '我的', '怎么', '为什么', '都在', '推荐',
      '超全', '巨细', '贼香', '爆爽', '绝了', '太绝', '超赞', '巨牛', '贼强', '爆燃', '超燃', '巨燃',
      '贼燃', '绝燃', '太燃', '超爽', '巨爽', '贼爽', '绝爽', '太爽', '超神', '巨神', '贼神', '绝神',
      '太神', '超稳', '巨稳', '贼稳', '绝稳', '太稳', '超秀', '巨秀', '贼秀', '绝秀', '太秀', '超顶',
      '巨顶', '贼顶', '绝顶', '太顶', '超炸', '巨炸', '贼炸', '绝炸', '太炸', '超猛', '巨猛', '贼猛',
      '绝猛', '太猛', '超酷', '巨酷', '贼酷', '绝酷', '太酷', '超炫', '巨炫', '贼炫', '绝炫', '太炫',
      '超飒',  '绝飒', '太飒', '超 A', '巨 A', '贼 A', '绝 A', '太 A', '超甜', '巨甜',
      '贼甜', '绝甜', '太甜', '超虐', '巨虐', '贼虐', '绝虐', '太虐', '超萌', '巨萌', '贼萌', '绝萌',
      '太萌', '超可爱', '巨可爱', '贼可爱', '绝可爱', '太可爱'
    ]);
    
    this.segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    
    this.loadUserDefinedWords();
  }
  
  async loadUserDefinedWords() {
    const { userDefinedWords = [] } = await this.getUserConfig();
    this.userDefinedWords = new Set(userDefinedWords);
  }
  
  // 预分词工具函数：处理自定义词库，返回 tokens 数组
  tokenizeWithUserWords(title) {
    let processedTitle = title;
    const placeholders = [];
    const originalTexts = [];
    
    // 优先处理自定义词：使用智能正则匹配
    this.userDefinedWords.forEach(word => {
      const regex = this.createSmartRegex(word, 'gi');
      const matches = processedTitle.match(regex);
      
      if (matches) {
        matches.forEach(match => {
          const placeholder = `__WORD_${placeholders.length}__`;
          placeholders.push(placeholder);
          originalTexts.push(match);
          processedTitle = processedTitle.replace(match, placeholder);
        });
      }
    });
    
    // 使用 Intl.Segmenter 分词
    const rawTokens = [];
    const segments = this.segmenter.segment(processedTitle);
    for (const segment of segments) {
      const word = segment.segment.trim();
      if (word.length > 0) {
        rawTokens.push(word);
      }
    }
    
    // 还原自定义词（保留原始大小写）
    const finalTokens = rawTokens.map(token => {
      if (token.startsWith('__WORD_') && token.endsWith('__')) {
        const index = parseInt(token.replace('__WORD_', '').replace('__', ''));
        return originalTexts[index] || token;
      }
      return token;
    });
    
    return {
      rawTokens: finalTokens,
      lowerTokens: finalTokens.map(t => t.toLowerCase())
    };
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
      const videos = this.fetchHistoryData();
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
    
    return data.data.list.map(item => {
      const { rawTokens, lowerTokens } = this.tokenizeWithUserWords(item.title);
      return {
        title: item.title,
        bvid: item.bvid,
        rawTokens: rawTokens,
        lowerTokens: lowerTokens
      };
    });
  }

  // 获取历史记录数据（DOM 抓取模式）
  fetchHistoryData() {
    console.log('[BiliExtension] 正在使用新版 .bili-video-card 选择器抓取...');
    
    // 1. 获取所有视频卡片
    const cards = document.querySelectorAll('.bili-video-card');
    
    if (cards.length === 0) {
      console.warn('[BiliExtension] 未找到 .bili-video-card 元素，可能是页面结构变更或未加载完成');
      return [];
    }

    const uniqueVideos = new Map();

    cards.forEach(card => {
      // 2. 精准定位标题元素
      const titleEl = card.querySelector('.bili-video-card__title');
      // 3. 查找链接 (通常封面就是个a标签)
      const linkEl = card.querySelector('a[href*="/video/"]');

      if (titleEl && linkEl) {
        // 优先取 title 属性(完整)，没有则取 text(可能有省略号)
        const title = titleEl.getAttribute('title') || titleEl.innerText.trim();
        const rawHref = linkEl.href;
        
        // 简单的 href 清洗，作为去重 Key
        const cleanKey = rawHref.split('?')[0];

        if (title && !uniqueVideos.has(cleanKey)) {
          // 预分词
          const { rawTokens, lowerTokens } = this.tokenizeWithUserWords(title);
          uniqueVideos.set(cleanKey, {
            title: title,
            bvid: cleanKey.split('/video/')[1] || null,
            rawTokens: rawTokens,
            lowerTokens: lowerTokens
          });
        }
      }
    });

    const result = Array.from(uniqueVideos.values());
    console.log(`[BiliExtension] 抓取成功: ${result.length} 个视频`);
    return result;
  }

  // 分析标题，统计词频（支持自定义词库）
  async analyzeTitles(titles) {
    const wordCount = new Map();
    
    const { blockedWords = [], userPhrases = [], userDefinedWords = [] } = await this.getUserConfig();
    const blockedSet = new Set(blockedWords);
    const phraseSet = new Set(userPhrases);
    
    titles.forEach(title => {
      let processedTitle = title;
      const currentTitleWords = new Set();
      
      // 处理自定义短语：根据 isCaseSensitive 决定匹配方式
      if (phraseSet.size > 0) {
        phraseSet.forEach(phrase => {
          let regex;
          if (this.isCaseSensitive) {
            // 严格模式：精确匹配
            regex = this.createSmartRegex(phrase, 'g');
          } else {
            // 合并模式：忽略大小写匹配
            regex = this.createSmartRegex(phrase, 'gi');
          }
          const matches = processedTitle.match(regex);
          if (matches) {
            // 标记当前标题包含该短语
            currentTitleWords.add(phrase);
            processedTitle = processedTitle.replace(regex, ' ');
          }
        });
      }
      
      // 使用自定义词库进行分词
      const { rawTokens } = this.tokenizeWithUserWords(processedTitle);
      
      for (const word of rawTokens) {
        if (word.length > 1 && 
            !this.stopWords.has(word) && 
            !blockedSet.has(word) &&
            !phraseSet.has(word) &&
            /^[\u4e00-\u9fa5a-zA-Z0-9]+$/.test(word) &&
            !/^\d+$/.test(word) &&
            !/^[\p{P}\p{S}]+$/u.test(word) &&
            !/^[\d\p{P}\p{S}]+$/u.test(word)) {
          // 标记当前标题包含该词
          currentTitleWords.add(word);
        }
      }
      
      // 对当前标题去重后的词进行全局统计
      currentTitleWords.forEach(word => {
        if (this.isCaseSensitive) {
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        } else {
          const lowerKey = word.toLowerCase();
          if (!wordCount.has(lowerKey)) {
            wordCount.set(lowerKey, { total: 0, variants: {} });
          }
          const data = wordCount.get(lowerKey);
          data.total++;
          data.variants[word] = (data.variants[word] || 0) + 1;
        }
      });
    });
    
    // 处理结果
    let sortedWords;
    if (this.isCaseSensitive) {
      sortedWords = Array.from(wordCount.entries())
        .sort((a, b) => b[1] - a[1]);
    } else {
      sortedWords = Array.from(wordCount.entries())
        .map(([lowerKey, data]) => {
          const bestVariant = Object.entries(data.variants)
            .sort((a, b) => b[1] - a[1])[0][0];
          return [bestVariant, data.total];
        })
        .sort((a, b) => b[1] - a[1]);
    }
    
    return sortedWords;
  }
  
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // 判断是否为纯英文/数字（用于决定是否添加单词边界）
  isPureEnglishOrNumber(text) {
    return /^[a-zA-Z0-9]+$/.test(text);
  }
  
  // 生成智能匹配正则（根据是否为纯英文/数字决定是否添加单词边界）
  createSmartRegex(phrase, flags = '') {
    const escapedPhrase = this.escapeRegExp(phrase);
    if (this.isPureEnglishOrNumber(phrase)) {
      // 纯英文/数字：添加单词边界
      return new RegExp('\\b' + escapedPhrase + '\\b', flags);
    } else {
      // 包含中文或其他字符：不添加边界
      return new RegExp(escapedPhrase, flags);
    }
  }
  
  async getUserConfig() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['blockedWords', 'userPhrases', 'userDefinedWords'], (result) => {
          resolve({
            blockedWords: result.blockedWords || [],
            userPhrases: result.userPhrases || [],
            userDefinedWords: result.userDefinedWords || []
          });
        });
      } else {
        resolve({ blockedWords: [], userPhrases: [], userDefinedWords: [] });
      }
    });
  }
  
  saveUserConfig(blockedWords, userPhrases, userDefinedWords) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ blockedWords, userPhrases, userDefinedWords });
    }
    // 同时保存到 localStorage 以支持同步读取
    localStorage.setItem('biliBlockedWords', JSON.stringify(blockedWords || []));
    localStorage.setItem('biliUserPhrases', JSON.stringify(userPhrases || []));
    localStorage.setItem('biliUserDefinedWords', JSON.stringify(userDefinedWords || []));
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
          <div class="bili-case-sensitive-toggle">
            <label class="bili-toggle-switch">
              <input type="checkbox" id="bili-case-sensitive" ${this.isCaseSensitive ? 'checked' : ''}>
              <span class="bili-toggle-slider"></span>
            </label>
            <span class="bili-toggle-label">区分大小写</span>
          </div>
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
          <div id="bili-user-phrases-container"></div>
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
    await this.renderUserPhrases(videos);

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

    const caseSensitiveToggle = modalBody.querySelector('#bili-case-sensitive');
    if (caseSensitiveToggle) {
      caseSensitiveToggle.addEventListener('change', async (e) => {
        this.isCaseSensitive = e.target.checked;
        await this.handleReloadButtonClick();
      });
    }
  }

  async renderUserPhrases(videos) {
    const userPhrasesContainer = this.modal.querySelector('#bili-user-phrases-container');
    const { userPhrases = [] } = await this.getUserConfig();
    
    if (userPhrases.length === 0) {
      userPhrasesContainer.innerHTML = '';
      return;
    }

    const phraseStats = new Map();
    
    // 初始化短语统计结构
    userPhrases.forEach(phrase => {
      phraseStats.set(phrase, { 
        total: 0, 
        variants: {} 
      });
    });

    videos.forEach(video => {
      userPhrases.forEach(phrase => {
        // 根据 isCaseSensitive 决定匹配方式
        let matches;
        if (this.isCaseSensitive) {
          // 严格模式：精确匹配（使用智能正则）
          const regex = this.createSmartRegex(phrase, 'g');
          matches = video.title.match(regex);
        } else {
          // 合并模式：忽略大小写匹配（使用智能正则）
          const regex = this.createSmartRegex(phrase, 'gi');
          matches = video.title.match(regex);
        }
        
        if (matches) {
          const lowerPhrase = phrase.toLowerCase();
          
          if (!phraseStats.has(lowerPhrase)) {
            phraseStats.set(lowerPhrase, { 
              total: 0, 
              variants: {} 
            });
          }
          
          const stats = phraseStats.get(lowerPhrase);
          
          // 每个视频只计数 1 次（去重）
          stats.total++;
          
          // 记录每种写法的出现次数（用于决定展示哪个变体）
          // 提取实际匹配到的文本（可能是不同的写法）
          const matchedText = matches[0];
          stats.variants[matchedText] = (stats.variants[matchedText] || 0) + 1;
        }
      });
    });

    // 处理结果：选择出现频率最高的变体作为展示文本
    const sortedPhrases = Array.from(phraseStats.entries())
      .filter(([_, stats]) => stats.total > 0)
      .map(([lowerPhrase, stats]) => {
        const bestVariant = Object.entries(stats.variants)
          .sort((a, b) => b[1] - a[1])[0][0];
        return [bestVariant, stats.total];
      })
      .sort((a, b) => b[1] - a[1]);

    if (sortedPhrases.length === 0) {
      userPhrasesContainer.innerHTML = '';
      return;
    }

    const maxPhraseCount = sortedPhrases[0][1];

    userPhrasesContainer.innerHTML = `
      <div class="bili-user-phrases-section">
        <div class="bili-user-phrases-header">
          <h4 class="bili-section-title">自定义短语</h4>
        </div>
        <div class="bili-user-phrases-list">
          ${sortedPhrases.map(([phrase, count], index) => {
            const percentage = (count / maxPhraseCount) * 100;
            return `
              <div class="bili-user-phrase-item" style="animation-delay: ${index * 0.03}s">
                <div class="bili-user-phrase-word" data-keyword="${phrase}">${phrase}</div>
                <div class="bili-user-phrase-bar">
                  <div class="bili-user-phrase-bar-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="bili-user-phrase-count">${count}次</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    const phraseElements = userPhrasesContainer.querySelectorAll('.bili-user-phrase-word');
    phraseElements.forEach(phraseElement => {
      const phrase = phraseElement.getAttribute('data-keyword');
      phraseElement.addEventListener('dblclick', () => {
        this.toggleKeywordFilter(phrase);
      });
    });
  }

  toggleKeywordFilter(keyword) {
    if (this.currentFilterKeyword === keyword) {
      this.currentFilterKeyword = null;
      this.renderVideoList(this.originalVideos);
      this.updateKeywordHighlight(null);
    } else {
      this.currentFilterKeyword = keyword;
      
      let filteredVideos;
      
      // 检查是否为自定义短语
      const { userPhrases = [] } = this.getUserConfigSync();
      const isUserPhrase = userPhrases.includes(keyword);
      
      if (this.isCaseSensitive) {
        // 严格模式
        if (isUserPhrase) {
          // 自定义短语：使用智能正则精确匹配
          const regex = this.createSmartRegex(keyword);
          filteredVideos = this.originalVideos.filter(video => 
            regex.test(video.title)
          );
        } else {
          // 普通词：使用 rawTokens 精确匹配
          filteredVideos = this.originalVideos.filter(video => 
            video.rawTokens.includes(keyword)
          );
        }
      } else {
        // 合并模式
        const lowerKeyword = keyword.toLowerCase();
        
        if (isUserPhrase) {
          // 自定义短语：使用智能正则忽略大小写匹配
          const regex = this.createSmartRegex(keyword, 'i');
          filteredVideos = this.originalVideos.filter(video => 
            regex.test(video.title)
          );
          
          // 精确匹配的排在前面
          filteredVideos.sort((a, b) => {
            const hasExactA = a.title.includes(keyword);
            const hasExactB = b.title.includes(keyword);
            
            if (hasExactA && !hasExactB) return -1;
            if (!hasExactA && hasExactB) return 1;
            return 0;
          });
        } else {
          // 普通词：使用 lowerTokens 进行大小写无关匹配
          filteredVideos = this.originalVideos.filter(video => 
            video.lowerTokens.includes(lowerKeyword)
          );
          
          // 精确匹配的排在前面
          filteredVideos.sort((a, b) => {
            const hasExactA = a.title.includes(keyword);
            const hasExactB = b.title.includes(keyword);
            
            if (hasExactA && !hasExactB) return -1;
            if (!hasExactA && hasExactB) return 1;
            return 0;
          });
        }
      }
      
      this.renderVideoList(filteredVideos);
      this.updateKeywordHighlight(keyword);
    }
  }
  
  getUserConfigSync() {
    try {
      const blockedWords = JSON.parse(localStorage.getItem('biliBlockedWords') || '[]');
      const userPhrases = JSON.parse(localStorage.getItem('biliUserPhrases') || '[]');
      const userDefinedWords = JSON.parse(localStorage.getItem('biliUserDefinedWords') || '[]');
      return {
        blockedWords,
        userPhrases,
        userDefinedWords
      };
    } catch (e) {
      return { blockedWords: [], userPhrases: [], userDefinedWords: [] };
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
          <button class="bili-dict-btn" id="bili-dict-btn">📖 词库</button>
          <button class="bili-reload-btn" id="bili-reload-btn">🔄 重新加载</button>
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

    const reloadBtn = this.modal.querySelector('#bili-reload-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => this.handleReloadButtonClick());
    }

    const dictBtn = this.modal.querySelector('#bili-dict-btn');
    if (dictBtn) {
      dictBtn.addEventListener('click', () => this.openDictModal());
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

  // 打开自定义词库模态框
  async openDictModal() {
    if (this.dictModal) {
      this.dictModal.classList.add('visible');
      return;
    }

    const { userDefinedWords = [] } = await this.getUserConfig();

    this.dictModal = document.createElement('div');
    this.dictModal.className = 'bili-submodal-overlay';
    
    this.dictModal.innerHTML = `
      <div class="bili-submodal-content">
        <div class="bili-submodal-header">
          <h3>自定义词库</h3>
          <button class="bili-modal-close">&times;</button>
        </div>
        <div class="bili-submodal-body">
          <div class="bili-config-section">
            <div class="bili-config-item">
              <label class="bili-config-label">专有名词（用逗号分隔）</label>
              <textarea class="bili-config-textarea" id="bili-user-words" placeholder="例如：DeepSeek,Vue3,ChatGPT">${userDefinedWords.join(',')}</textarea>
              <div class="bili-config-hint">设置后，这些词将作为整体被统计，不会被拆分</div>
            </div>
          </div>
        </div>
        <div class="bili-submodal-footer">
          <button class="bili-submodal-btn bili-submodal-btn-cancel" id="bili-dict-cancel-btn">取消</button>
          <button class="bili-submodal-btn bili-submodal-btn-save" id="bili-dict-save-btn">保存</button>
        </div>
      </div>
    `;

    const closeButtons = this.dictModal.querySelectorAll('.bili-modal-close, #bili-dict-cancel-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.closeDictModal());
    });

    this.dictModal.addEventListener('click', (e) => {
      if (e.target === this.dictModal) {
        this.closeDictModal();
      }
    });

    const saveBtn = this.dictModal.querySelector('#bili-dict-save-btn');
    saveBtn.addEventListener('click', () => this.saveDictAndRefresh());

    document.body.appendChild(this.dictModal);
    
    setTimeout(() => {
      this.dictModal.classList.add('visible');
    }, 10);
  }

  // 关闭自定义词库模态框
  closeDictModal() {
    if (this.dictModal) {
      this.dictModal.classList.remove('visible');
    }
  }

  // 保存自定义词库并刷新
  async saveDictAndRefresh() {
    const userWordsInput = this.dictModal.querySelector('#bili-user-words').value;
    const newUserWords = userWordsInput.split(',').map(w => w.trim()).filter(w => w);
    
    this.userDefinedWords = new Set(newUserWords);
    
    const { blockedWords = [], userPhrases = [] } = await this.getUserConfig();
    this.saveUserConfig(blockedWords, userPhrases, newUserWords);
    
    this.closeDictModal();
    
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

  // 重新加载数据
  async handleReloadButtonClick() {
    const modalBody = this.modal.querySelector('.bili-modal-body');
    modalBody.innerHTML = '<div class="bili-loading">正在重新读取B站数据...</div>';
    
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
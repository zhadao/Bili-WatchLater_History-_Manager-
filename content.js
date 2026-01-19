// Bilibili Analyzer - Refactored with services (single-file)
// Services: ConfigService, TextEngine, DataService, UIService
// Controller: BiliAnalyzer

// 1. 集中管理选择器，防止B站改版导致抓取失效
const SELECTORS = {
  historyCard: '.bili-video-card',
  historyTitle: '.bili-video-card__title',
  historyLink: 'a[href*="/video/"]'
};

/**
 * ConfigService: 负责所有存储逻辑 (localStorage/chrome.storage)
 * 解决了之前代码中混乱的降级判断
 */
class ConfigService {
  constructor() {
    this.keys = {
      blockedWords: 'biliBlockedWords',
      userPhrases: 'biliUserPhrases',
      userDefinedWords: 'biliUserDefinedWords',
      stopWordsCache: 'biliStopWordsFileContent',
      theme: 'biliTheme'
    };
  }

  isChromeContextValid() {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    } catch {
      return false;
    }
  }

  getConfigSync() {
    try {
      return {
        blockedWords: JSON.parse(localStorage.getItem(this.keys.blockedWords) || '[]'),
        userPhrases: JSON.parse(localStorage.getItem(this.keys.userPhrases) || '[]'),
        userDefinedWords: JSON.parse(localStorage.getItem(this.keys.userDefinedWords) || '[]')
      };
    } catch {
      return { blockedWords: [], userPhrases: [], userDefinedWords: [] };
    }
  }

  async getConfig() {
    const fallback = this.getConfigSync();
    if (!this.isChromeContextValid() || !chrome.storage?.local) return fallback;
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['blockedWords', 'userPhrases', 'userDefinedWords'], (result) => {
          if (chrome.runtime?.lastError) {
            resolve(fallback);
            return;
          }
          resolve({
            blockedWords: result.blockedWords || fallback.blockedWords,
            userPhrases: result.userPhrases || fallback.userPhrases,
            userDefinedWords: result.userDefinedWords || fallback.userDefinedWords
          });
        });
      } catch {
        resolve(fallback);
      }
    });
  }

  saveConfig(blockedWords, userPhrases, userDefinedWords) {
    // 优先存 LocalStorage
    try {
      localStorage.setItem(this.keys.blockedWords, JSON.stringify(blockedWords || []));
      localStorage.setItem(this.keys.userPhrases, JSON.stringify(userPhrases || []));
      localStorage.setItem(this.keys.userDefinedWords, JSON.stringify(userDefinedWords || []));
    } catch (e) {
      console.warn('[ConfigService] localStorage save error:', e);
    }

    // 同步到 Chrome Storage
    if (this.isChromeContextValid() && chrome.storage?.local) {
      try {
        chrome.storage.local.set({ blockedWords, userPhrases, userDefinedWords }, () => {
          if (chrome.runtime?.lastError) {
            console.warn('[ConfigService] chrome.storage save error:', chrome.runtime.lastError.message);
          }
        });
      } catch (e) {
        console.warn('[ConfigService] chrome.storage save error:', e);
      }
    }
  }

  getTheme() {
    try {
      return localStorage.getItem(this.keys.theme) || 'light';
    } catch {
      return 'light';
    }
  }

  setTheme(theme) {
    try {
      localStorage.setItem(this.keys.theme, theme);
    } catch (e) {
      console.warn('[ConfigService] theme save error:', e);
    }
  }

  getStopWordsCache() {
    try {
      return localStorage.getItem(this.keys.stopWordsCache) || '';
    } catch {
      return '';
    }
  }

  setStopWordsCache(text) {
    try {
      localStorage.setItem(this.keys.stopWordsCache, text || '');
    } catch (e) {
      console.warn('[ConfigService] stopwords cache save error:', e);
    }
  }
}

/**
 * TextEngine: 核心分词与文本处理
 * 优化点：使用单一正则 (Single Regex) 替代循环 Replace，极大提升性能
 */
class TextEngine {
  constructor(configService) {
    this.configService = configService;
    this.segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    this.builtInStopWords = new Set(['[', ']', '(', ')', ',', '.', '!', '?', '/', ':', ';', '"', "'", ' ', '\t', '\n']);
    this.stopWords = new Set();
    this.stopWordsFileContent = '';
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async loadStopWordsFromFile() {
    this.stopWords.clear();
    let text = this.configService.getStopWordsCache();
    
    // 如果缓存没数据，去读文件
    if (!text) {
      try {
        const url = chrome.runtime.getURL('stopwords.txt');
        const res = await fetch(url);
        if (res.ok) {
          text = await res.text();
          this.configService.setStopWordsCache(text);
        }
      } catch (e) {
        console.warn('[TextEngine] loadStopWordsFromFile error:', e.message);
        return;
      }
    }
    
    this.stopWordsFileContent = text;
    text.split('\n').forEach((line, idx) => {
      const words = line.split(',').map((w) => w.trim()).filter(Boolean).slice(0, 15);
      if (words.length > 15) console.warn(`[TextEngine] Line ${idx + 1} >15 words, truncated.`);
      words.forEach((w) => this.stopWords.add(w));
    });
  }

  segment(text, out) {
    const segs = this.segmenter.segment(text);
    for (const s of segs) {
      const word = s.segment.trim();
      if (word) out.push(word);
    }
    return out;
  }

  // ⚡️ 核心优化算法：正则切分 + Intl.Segmenter
  tokenizeWithUserWords(title, userDefinedWords = []) {
    const tokens = [];
    
    // 如果没有自定义词，直接分词
    if (!userDefinedWords.length) {
      this.segment(title, tokens);
      return { rawTokens: tokens, lowerTokens: tokens.map((t) => t.toLowerCase()) };
    }

    // 将所有自定义词构建为一个大的正则: (Vue3|DeepSeek|React)
    const combined = userDefinedWords
      .sort((a, b) => b.length - a.length) // 长词优先
      .map((w) => this.escapeRegExp(w))
      .join('|');
      
    if (!combined) {
      this.segment(title, tokens);
      return { rawTokens: tokens, lowerTokens: tokens.map((t) => t.toLowerCase()) };
    }

    const regex = new RegExp(combined, 'gi');
    let last = 0;
    let match;

    // 扫描字符串
    while ((match = regex.exec(title)) !== null) {
      const start = match.index;
      // 1. 对匹配点之前的部分进行标准分词
      if (start > last) {
        this.segment(title.slice(last, start), tokens);
      }
      // 2. 将匹配到的自定义词直接加入 (保留原始大小写)
      tokens.push(match[0]);
      last = regex.lastIndex;
    }
    
    // 3. 处理剩余部分
    if (last < title.length) {
      this.segment(title.slice(last), tokens);
    }

    return { rawTokens: tokens, lowerTokens: tokens.map((t) => t.toLowerCase()) };
  }
}

/**
 * DataService: 负责数据获取 (API 或 DOM)
 */
class DataService {
  constructor(textEngine, selectors) {
    this.textEngine = textEngine;
    this.selectors = selectors;
  }

  async fetchBilibiliData(url) {
    const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'include' });
    return res.json();
  }

  async fetchWatchLaterData(userDefinedWords) {
    const data = await this.fetchBilibiliData('https://api.bilibili.com/x/v2/history/toview');
    if (data.code !== 0) {
      if (data.code === -101) throw new Error('B站服务器认为您未登录，请刷新页面重试');
      throw new Error(data.message || '获取数据失败');
    }
    if (!data.data?.list?.length) throw new Error('稍后再看列表为空');
    
    return data.data.list.map((item) => {
      const { rawTokens, lowerTokens } = this.textEngine.tokenizeWithUserWords(item.title, userDefinedWords);
      return { title: item.title, bvid: item.bvid, rawTokens, lowerTokens };
    });
  }

  fetchHistoryData(userDefinedWords) {
    console.log('[BiliExtension] 开始抓取历史记录...');
    const cards = document.querySelectorAll(this.selectors.historyCard);
    
    if (!cards.length) {
      console.warn('[BiliExtension] 未找到历史记录卡片');
      return [];
    }
    
    const unique = new Map();
    cards.forEach((card) => {
      const titleEl = card.querySelector(this.selectors.historyTitle);
      const linkEl = card.querySelector(this.selectors.historyLink);
      
      if (titleEl && linkEl) {
        const title = titleEl.getAttribute('title') || titleEl.innerText.trim();
        const href = linkEl.href.split('?')[0]; // 去重 Key
        
        if (title && !unique.has(href)) {
          const { rawTokens, lowerTokens } = this.textEngine.tokenizeWithUserWords(title, userDefinedWords);
          unique.set(href, {
            title,
            bvid: href.split('/video/')[1] || null,
            rawTokens,
            lowerTokens,
            view_at: Number(linkEl.getAttribute('data-time')) || undefined
          });
        }
      }
    });
    
    console.log(`[BiliExtension] 抓取到 ${unique.size} 个视频`);
    return [...unique.values()];
  }
}

/**
 * UIService: 负责 DOM 创建与渲染
 * 优化点：减少 innerHTML 使用，防止 XSS
 */
class UIService {
  constructor(controller, configService) {
    this.controller = controller;
    this.configService = configService;
    this.modal = null;
  }

  applyTheme(el, theme) {
    if (!el) return;
    if (theme === 'dark') el.setAttribute('data-theme', 'dark');
    else el.removeAttribute('data-theme');
  }

  createMainModal(title, savedTheme) {
    this.modal = document.createElement('div');
    this.modal.className = 'bili-modal-overlay';
    this.applyTheme(this.modal, savedTheme);
    this.modal.innerHTML = `
      <div class="bili-modal-content">
        <div class="bili-modal-header">
          <h3>${title}</h3>
          <div class="bili-theme-toggle">
            <button class="bili-theme-toggle-btn" id="bili-theme-toggle" data-theme="${savedTheme}">
              <span class="bili-theme-toggle-slider"></span>
            </button>
          </div>
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
          <button class="bili-footer-btn" id="bili-dict-btn">📖 词库</button>
          <button class="bili-footer-btn" id="bili-reload-btn">🔄 重新加载</button>
          <button class="bili-footer-btn bili-footer-btn-close">关闭</button>
        </div>
        <button class="bili-info-btn" id="bili-info-btn" title="关于">i</button>
      </div>
    `;
    document.body.appendChild(this.modal);
    this.bindMainModalEvents();
  }

  bindMainModalEvents() {
    const closeButtons = this.modal.querySelectorAll('.bili-modal-close, .bili-footer-btn-close');
    closeButtons.forEach((btn) => btn.addEventListener('click', () => this.controller.closeModal()));
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.controller.closeModal();
    });

    this.modal.querySelector('#bili-config-btn')?.addEventListener('click', () => this.controller.openConfigModal());
    this.modal.querySelector('#bili-reload-btn')?.addEventListener('click', () => this.controller.handleReloadButtonClick());
    this.modal.querySelector('#bili-dict-btn')?.addEventListener('click', () => this.controller.openDictModal());

    const toggleBtn = this.modal.querySelector('#bili-theme-toggle');
    toggleBtn?.addEventListener('click', () => {
      this.controller.toggleTheme();
      toggleBtn.setAttribute('data-theme', this.configService.getTheme());
      this.applyTheme(this.modal, this.configService.getTheme());
    });

    this.modal.querySelector('#bili-info-btn')?.addEventListener('click', () => this.controller.openAboutModal());
  }

  renderVideoList(container, videos) {
    container.innerHTML = '';
    if (!videos.length) {
      container.innerHTML = '<div class="bili-empty-state">暂无相关视频</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    videos.forEach((video, index) => {
      const item = document.createElement('div');
      item.className = 'bili-video-item';
      item.style.animationDelay = `${index * 0.02}s`;

      const title = document.createElement('div');
      title.className = 'bili-video-title';
      title.dataset.bvid = video.bvid || '';
      title.textContent = video.title;
      const icon = document.createElement('span');
      icon.className = 'bili-video-link-icon';
      icon.textContent = '🔗';
      title.appendChild(icon);
      title.addEventListener('click', () => {
        if (video.bvid) window.open(`https://www.bilibili.com/video/${video.bvid}`, '_blank');
      });
      item.appendChild(title);

      if (video.view_at) {
        const date = new Date(video.view_at * 1000);
        const timeStr = date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const timeEl = document.createElement('div');
        timeEl.className = 'bili-video-time';
        timeEl.textContent = timeStr;
        item.appendChild(timeEl);
      }
      frag.appendChild(item);
    });
    container.appendChild(frag);
  }
}

/**
 * BiliAnalyzer: 控制器 (Controller)
 * 整合所有服务，处理业务逻辑和路由状态
 */
class BiliAnalyzer {
  constructor() {
    this.currentBvid = '';
    this.currentScene = '';
    this.exportButton = null;
    this.analyzeButton = null;
    this.lastUrl = '';
    this.originalVideos = [];
    this.currentFilterKeyword = null;
    this.isCaseSensitive = false;
    this.userDefinedWords = new Set();
    this.lastToggleTime = 0;

    // 初始化服务
    this.configService = new ConfigService();
    this.textEngine = new TextEngine(this.configService);
    this.dataService = new DataService(this.textEngine, SELECTORS);
    this.ui = new UIService(this, this.configService);

    this.initStopWords();
  }

  async initStopWords() {
    await this.textEngine.loadStopWordsFromFile();
  }

  // ---------------- Router Detection (Optimized) ----------------
  // 替换了旧的 setInterval，使用 History API Hook + MutationObserver
  hookNavigation() {
    const onChange = () => this.handleLocationChange();
    
    // Hook history API
    const pushState = history.pushState;
    history.pushState = (...args) => {
      pushState.apply(history, args);
      onChange();
    };
    const replaceState = history.replaceState;
    history.replaceState = (...args) => {
      replaceState.apply(history, args);
      onChange();
    };
    window.addEventListener('popstate', onChange);
    
    // 监听页面变化（适用于 SPA）
    new MutationObserver(() => onChange()).observe(document.querySelector('title') || document.body, {
      childList: true,
      subtree: true
    });
  }

  handleLocationChange() {
    const currentUrl = window.location.href;
    if (currentUrl === this.lastUrl) return;
    this.lastUrl = currentUrl;
    
    const url = new URL(currentUrl);
    const { pathname, searchParams, hash } = url;

    // 路由判断逻辑
    if (pathname.includes('/list/watchlater') && searchParams.has('bvid')) {
      this.handleWatchLaterPlayerScene(searchParams.get('bvid'));
    } else if ((pathname.includes('/watchlater/list') || hash.includes('#/list')) && !searchParams.has('bvid')) {
      this.handleWatchLaterListScene();
    } else if (pathname.includes('/history')) {
      this.handleHistoryScene();
    } else {
      this.hideAllButtons();
      this.currentScene = 'unknown';
    }
  }

  // ---------------- Scene Handling ----------------
  handleWatchLaterPlayerScene(bvid) {
    this.currentScene = 'watchlater_player';
    this.currentBvid = bvid;
    this.createExportButton();
    this.exportButton.classList.add('visible');
    this.analyzeButton?.classList.remove('visible');
  }

  handleWatchLaterListScene() {
    this.currentScene = 'watchlater_list';
    this.currentBvid = '';
    this.exportButton?.classList.remove('visible');
    this.createAnalyzeButton('📊 分析标题');
    this.analyzeButton.classList.add('visible');
  }

  handleHistoryScene() {
    this.currentScene = 'history';
    this.currentBvid = '';
    this.exportButton?.classList.remove('visible');
    this.createAnalyzeButton('📊 分析近期');
    this.analyzeButton.classList.add('visible');
  }

  hideAllButtons() {
    this.exportButton?.classList.remove('visible');
    this.analyzeButton?.classList.remove('visible');
  }

  // 创建转普通页按钮
  createExportButton() {
    if (this.exportButton) return;
    this.exportButton = document.createElement('button');
    this.exportButton.id = 'my-bilibili-extension-btn';
    this.exportButton.className = 'bili-exporter-btn';
    this.exportButton.textContent = '转普通页';
    this.exportButton.addEventListener('click', () => this.handleExportButtonClick());
    document.body.appendChild(this.exportButton);
  }

  // 创建分析按钮
  createAnalyzeButton(text) {
    if (this.analyzeButton) {
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

  // 转普通页
  handleExportButtonClick() {
    if (this.currentBvid) {
      const targetUrl = `https://www.bilibili.com/video/${this.currentBvid}`;
      window.open(targetUrl, '_blank');
    }
  }

  // 分析按钮
  async handleAnalyzeButtonClick() {
    if (!this.ui.modal) {
      const title = this.currentScene === 'history' ? '历史记录 - 近期观看统计' : '稍后再看 - 你的关注点统计';
      this.ui.createMainModal(title, this.configService.getTheme());
    }
    this.ui.modal.classList.add('visible');
    document.body.style.overflow = 'hidden';

    const modalBody = this.ui.modal.querySelector('.bili-modal-body');
    modalBody.innerHTML = '<div class="bili-loading">正在读取B站数据...</div>';

    try {
      const data = await this.fetchDataByScene();
      if (data.titles.length) {
        const results = await this.analyzeTitles(data.titles);
        this.renderAnalysisResults(results, data.videos);
      } else {
        modalBody.innerHTML = '<div class="bili-error">未找到近期记录</div>';
      }
    } catch (error) {
      modalBody.innerHTML = `<div class="bili-error">获取数据失败：${error.message}</div>`;
    }
  }

  // 根据场景获取数据
  async fetchDataByScene() {
    const cfg = await this.configService.getConfig();
    this.userDefinedWords = new Set(cfg.userDefinedWords || []);
    
    if (this.currentScene === 'history') {
      const videos = this.dataService.fetchHistoryData([...this.userDefinedWords]);
      return { titles: videos.map((v) => v.title), videos };
    }
    if (this.currentScene === 'watchlater_list') {
      const videos = await this.dataService.fetchWatchLaterData([...this.userDefinedWords]);
      return { titles: videos.map((v) => v.title), videos };
    }
    return { titles: [], videos: [] };
  }

  // ---------------- Analysis Logic ----------------
  async analyzeTitles(titles) {
    const wordCount = new Map();
    const { blockedWords = [], userPhrases = [], userDefinedWords = [] } = await this.configService.getConfig();
    const blockedSet = new Set(blockedWords);
    const phraseSet = new Set(userPhrases);
    const userWordsSet = new Set(userDefinedWords);

    titles.forEach((title) => {
      let processedTitle = title;
      const currentTitleWords = new Set();

      // 1. 处理自定义短语 (Phrases)
      if (phraseSet.size) {
        phraseSet.forEach((phrase) => {
          const regex = this.createSmartRegex(phrase, this.isCaseSensitive ? 'g' : 'gi');
          const matches = processedTitle.match(regex);
          if (matches) {
            currentTitleWords.add(phrase);
            processedTitle = processedTitle.replace(regex, ' ');
          }
        });
      }

      // 2. 分词
      const { rawTokens } = this.textEngine.tokenizeWithUserWords(processedTitle, [...userWordsSet]);
      
      // 3. 过滤
      for (const word of rawTokens) {
        if (
          word.length > 1 &&
          !this.textEngine.builtInStopWords.has(word) &&
          !this.textEngine.stopWords.has(word) &&
          !blockedSet.has(word) &&
          !phraseSet.has(word) &&
          /^[\u4e00-\u9fa5a-zA-Z0-9]+$/.test(word) &&
          !/^\d+$/.test(word) &&
          !/^[\p{P}\p{S}]+$/u.test(word) &&
          !/^[\d\p{P}\p{S}]+$/u.test(word)
        ) {
          currentTitleWords.add(word);
        }
      }

      // 4. 统计
      currentTitleWords.forEach((word) => {
        if (this.isCaseSensitive) {
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        } else {
          const lower = word.toLowerCase();
          if (!wordCount.has(lower)) {
            wordCount.set(lower, { total: 0, variants: {} });
          }
          const data = wordCount.get(lower);
          data.total++;
          data.variants[word] = (data.variants[word] || 0) + 1;
        }
      });
    });

    // 5. 排序输出
    if (this.isCaseSensitive) {
      return [...wordCount.entries()].sort((a, b) => b[1] - a[1]);
    }
    return [...wordCount.entries()]
      .map(([lower, data]) => {
        const best = Object.entries(data.variants).sort((a, b) => b[1] - a[1])[0][0];
        return [best, data.total];
      })
      .sort((a, b) => b[1] - a[1]);
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  isPureEnglishOrNumber(text) {
    return /^[a-zA-Z0-9]+$/.test(text);
  }

  createSmartRegex(phrase, flags = '') {
    const escaped = this.escapeRegExp(phrase);
    // 纯英文/数字添加边界检查，防止 ai 匹配 repair
    return this.isPureEnglishOrNumber(phrase) ? new RegExp(`\\b${escaped}\\b`, flags) : new RegExp(escaped, flags);
  }

  // ---------------- UI Rendering ----------------
  async renderAnalysisResults(results, videos) {
    const modalBody = this.ui.modal.querySelector('.bili-modal-body');
    if (!results.length && !videos.length) {
      modalBody.innerHTML = '<div class="bili-error">没有找到有效数据</div>';
      return;
    }
    this.originalVideos = videos;
    this.currentFilterKeyword = null;

    const displayLimit = 30;
    const showExpandButton = results.length > displayLimit;
    const displayedResults = results.slice(0, displayLimit);
    const maxCount = results.length ? results[0][1] : 1;

    const keywordsHtml =
      results.length > 0
        ? `
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
          ${displayedResults
            .map(
              ([word, count], index) => `
              <div class="bili-result-item" style="animation-delay: ${index * 0.03}s">
                <div class="bili-result-word" data-keyword="${word}">${word}</div>
                <div class="bili-result-bar">
                  <div class="bili-result-bar-fill" style="width: ${(count / maxCount) * 100}%"></div>
                </div>
                <div class="bili-result-count">${count}次</div>
              </div>`
            )
            .join('')}
        </div>
      </div>`
        : '';

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

    this.ui.renderVideoList(modalBody.querySelector('#bili-video-list'), videos);
    await this.renderUserPhrases(videos, maxCount);

    modalBody.querySelectorAll('.bili-result-word').forEach((el) => {
      const kw = el.getAttribute('data-keyword');
      el.addEventListener('dblclick', () => this.toggleKeywordFilter(kw));
    });

    const expandBtn = modalBody.querySelector('#bili-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        const list = modalBody.querySelector('#bili-keywords-list');
        list.innerHTML = results
          .map(
            ([word, count], index) => `
            <div class="bili-result-item" style="animation-delay: ${index * 0.03}s">
              <div class="bili-result-word" data-keyword="${word}">${word}</div>
              <div class="bili-result-bar">
                <div class="bili-result-bar-fill" style="width: ${(count / maxCount) * 100}%"></div>
              </div>
              <div class="bili-result-count">${count}次</div>
            </div>`
          )
          .join('');
        expandBtn.style.display = 'none';
        list.querySelectorAll('.bili-result-word').forEach((el) => {
          const kw = el.getAttribute('data-keyword');
          el.addEventListener('dblclick', () => this.toggleKeywordFilter(kw));
        });
      });
    }

    const caseSensitiveToggle = modalBody.querySelector('#bili-case-sensitive');
    caseSensitiveToggle?.addEventListener('change', async (e) => {
      this.isCaseSensitive = e.target.checked;
      await this.handleReloadButtonClick();
    });
  }

  async renderUserPhrases(videos, globalMaxCount) {
    const container = this.ui.modal.querySelector('#bili-user-phrases-container');
    const { userPhrases = [] } = await this.configService.getConfig();
    if (!userPhrases.length) {
      container.innerHTML = '';
      return;
    }
    const phraseStats = new Map();
    videos.forEach((video) => {
      userPhrases.forEach((phrase) => {
        const regex = this.createSmartRegex(phrase, this.isCaseSensitive ? 'g' : 'gi');
        const matches = video.title.match(regex);
        if (matches) {
          const lower = phrase.toLowerCase();
          if (!phraseStats.has(lower)) phraseStats.set(lower, { total: 0, variants: {} });
          const stats = phraseStats.get(lower);
          stats.total++;
          stats.variants[matches[0]] = (stats.variants[matches[0]] || 0) + 1;
        }
      });
    });
    const sorted = [...phraseStats.entries()]
      .filter(([, stats]) => stats.total > 0)
      .map(([lower, stats]) => {
        const best = Object.entries(stats.variants).sort((a, b) => b[1] - a[1])[0][0];
        return [best, stats.total];
      })
      .sort((a, b) => b[1] - a[1]);

    if (!sorted.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="bili-keywords-section">
        <div class="bili-keywords-header">
          <h4 class="bili-section-title">自定义短语</h4>
        </div>
        <div class="bili-analysis-results bili-user-phrases-list">
          ${sorted
            .map(
              ([phrase, count], index) => `
              <div class="bili-result-item bili-user-phrase-item" style="animation-delay: ${index * 0.03}s">
                <div class="bili-result-word bili-user-phrase-word" data-keyword="${phrase}">${phrase}</div>
                <div class="bili-result-bar">
                  <div class="bili-result-bar-fill bili-user-phrase-bar-fill" style="width: ${(count / globalMaxCount) * 100}%"></div>
                </div>
                <div class="bili-result-count">${count}次</div>
              </div>`
            )
            .join('')}
        </div>
      </div>
    `;
    container.querySelectorAll('.bili-user-phrase-word').forEach((el) => {
      const kw = el.getAttribute('data-keyword');
      el.addEventListener('dblclick', () => this.toggleKeywordFilter(kw));
    });
  }

  toggleKeywordFilter(keyword) {
    const now = Date.now();
    if (now - this.lastToggleTime < 500) return;
    this.lastToggleTime = now;

    // 取消筛选
    if (this.currentFilterKeyword === keyword && this.originalVideos.length) {
      this.currentFilterKeyword = null;
      this.renderVideoList(this.originalVideos);
      this.updateKeywordHighlight(null);
      return;
    }

    // 1. 优先尝试正则匹配
    const regex = this.createSmartRegex(keyword, this.isCaseSensitive ? '' : 'i');
    let matchedVideos = this.originalVideos.filter((video) => {
      regex.lastIndex = 0;
      return regex.test(video.title);
    });
    
    // 2. 降级匹配 Tokens
    if (!matchedVideos.length) {
      const lower = keyword.toLowerCase();
      matchedVideos = this.originalVideos.filter((video) => video.rawTokens?.some((t) => t.toLowerCase() === lower));
    }

    if (!matchedVideos.length) {
      const list = this.ui.modal.querySelector('#bili-video-list');
      list.innerHTML = '<div class="bili-empty-state">未找到包含该词的视频</div>';
      this.updateKeywordHighlight(keyword);
      this.currentFilterKeyword = keyword;
      return;
    }

    this.currentFilterKeyword = keyword;
    this.renderVideoList(matchedVideos);
    this.updateKeywordHighlight(keyword);
  }

  renderVideoList(videos) {
    const container = this.ui.modal.querySelector('#bili-video-list');
    this.ui.renderVideoList(container, videos);
  }

  updateKeywordHighlight(keyword) {
    const els = this.ui.modal.querySelectorAll('.bili-result-word');
    els.forEach((el) => el.classList.remove('bili-keyword-selected'));
    if (keyword) {
      this.ui.modal.querySelectorAll(`.bili-result-word[data-keyword="${keyword}"]`).forEach((el) => {
        el.classList.add('bili-keyword-selected');
      });
    }
  }

  // -------- Modals (Dict / Config / About / Stopwords Editor) ----------
  
  // 1. Custom Dictionary Modal
  async openDictModal() {
    if (this.dictModal) {
      this.dictModal.classList.add('visible');
      return;
    }
    const { userDefinedWords = [] } = await this.configService.getConfig();
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
    this.dictModal.querySelectorAll('.bili-modal-close, #bili-dict-cancel-btn').forEach((btn) =>
      btn.addEventListener('click', () => this.closeDictModal())
    );
    this.dictModal.addEventListener('click', (e) => {
      if (e.target === this.dictModal) this.closeDictModal();
    });
    this.dictModal.querySelector('#bili-dict-save-btn').addEventListener('click', () => this.saveDictAndRefresh());
    document.body.appendChild(this.dictModal);
    setTimeout(() => this.dictModal.classList.add('visible'), 10);
  }

  closeDictModal() {
    this.dictModal?.classList.remove('visible');
  }

  async saveDictAndRefresh() {
    const input = this.dictModal.querySelector('#bili-user-words').value;
    const newUserWords = input.split(',').map((w) => w.trim()).filter(Boolean);
    const { blockedWords = [], userPhrases = [] } = await this.configService.getConfig();
    this.configService.saveConfig(blockedWords, userPhrases, newUserWords);
    this.userDefinedWords = new Set(newUserWords);
    this.closeDictModal();
    await this.handleReloadButtonClick();
  }

  // 2. Config Modal
  async openConfigModal() {
    if (this.configModal) {
      this.configModal.classList.add('visible');
      return;
    }
    const { blockedWords = [], userPhrases = [] } = await this.configService.getConfig();
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
              <button class="bili-edit-stopwords-btn" id="bili-edit-stopwords-btn">📝 编辑内置屏蔽词库</button>
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
    this.configModal.querySelectorAll('.bili-modal-close, #bili-config-cancel-btn').forEach((btn) =>
      btn.addEventListener('click', () => this.closeConfigModal())
    );
    this.configModal.addEventListener('click', (e) => {
      if (e.target === this.configModal) this.closeConfigModal();
    });
    this.configModal.querySelector('#bili-config-save-btn').addEventListener('click', () => this.saveConfigAndRefresh());
    this.configModal.querySelector('#bili-edit-stopwords-btn').addEventListener('click', () => this.openStopWordsEditor());
    document.body.appendChild(this.configModal);
    setTimeout(() => this.configModal.classList.add('visible'), 10);
  }

  closeConfigModal() {
    this.configModal?.classList.remove('visible');
  }

  async saveConfigAndRefresh() {
    const blockedWordsInput = this.configModal.querySelector('#bili-blocked-words').value;
    const userPhrasesInput = this.configModal.querySelector('#bili-user-phrases').value;
    const newBlockedWords = blockedWordsInput.split(',').map((w) => w.trim()).filter(Boolean);
    const newUserPhrases = userPhrasesInput.split(',').map((p) => p.trim()).filter(Boolean);
    const { userDefinedWords = [] } = await this.configService.getConfig();
    this.configService.saveConfig(newBlockedWords, newUserPhrases, userDefinedWords);
    this.closeConfigModal();
    await this.handleReloadButtonClick();
  }

  // 3. About modal
  openAboutModal() {
    if (this.aboutModal) {
      this.aboutModal.classList.add('visible');
      return;
    }
    this.aboutModal = document.createElement('div');
    this.aboutModal.className = 'bili-about-modal';
    this.applyThemeToAbout();
    this.aboutModal.innerHTML = `
      <div class="bili-about-content">
        <div class="bili-about-header">
          <h3>关于</h3>
          <button class="bili-modal-close">&times;</button>
        </div>
        <div class="bili-about-body">
          <div class="bili-about-text">
            <div class="bili-about-text-line">制作：@扎导ZHA</div>
            <div class="bili-about-text-line">感谢支持</div>
          </div>
          <div class="bili-about-buttons">
            <a href="https://github.com/zhadao/Bili-WatchLater_History-_Manager-" target="_blank" class="bili-about-link-btn github">GitHub</a>
            <a href="https://space.bilibili.com/491873894?spm_id_from=333.1007.0.0" target="_blank" class="bili-about-link-btn bilibili">bilibili</a>
          </div>
        </div>
      </div>
    `;
    this.aboutModal.querySelector('.bili-modal-close')?.addEventListener('click', () => this.closeAboutModal());
    this.aboutModal.addEventListener('click', (e) => {
      if (e.target === this.aboutModal) this.closeAboutModal();
    });
    document.body.appendChild(this.aboutModal);
    setTimeout(() => this.aboutModal.classList.add('visible'), 10);
  }

  applyThemeToAbout() {
    const theme = this.configService.getTheme();
    if (theme === 'dark') this.aboutModal?.setAttribute('data-theme', 'dark');
    else this.aboutModal?.removeAttribute('data-theme');
  }

  closeAboutModal() {
    this.aboutModal?.classList.remove('visible');
  }

  // 4. Stopwords editor
  openStopWordsEditor() {
    if (this.stopWordsEditorModal) {
      this.stopWordsEditorModal.classList.add('visible');
      return;
    }
    const content = this.textEngine.stopWordsFileContent || '';
    this.stopWordsEditorModal = document.createElement('div');
    this.stopWordsEditorModal.className = 'bili-submodal-overlay';
    this.stopWordsEditorModal.innerHTML = `
      <div class="bili-submodal-content">
        <div class="bili-submodal-header">
          <h3>编辑内置屏蔽词库</h3>
          <button class="bili-modal-close">&times;</button>
        </div>
        <div class="bili-submodal-body">
          <div class="bili-config-section">
            <div class="bili-config-item">
              <label class="bili-config-label">屏蔽词内容（每行最多15个词，用英文逗号分隔）</label>
              <textarea class="bili-config-textarea bili-stopwords-editor" id="bili-stopwords-content" placeholder="例如：的,了,是,和,在">${content}</textarea>
              <div class="bili-config-hint">编辑后点击保存，修改将立即生效</div>
            </div>
          </div>
        </div>
        <div class="bili-submodal-footer">
          <button class="bili-submodal-btn bili-submodal-btn-cancel" id="bili-stopwords-cancel-btn">取消</button>
          <button class="bili-submodal-btn bili-submodal-btn-save" id="bili-stopwords-save-btn">保存</button>
        </div>
      </div>
    `;
    this.stopWordsEditorModal.querySelectorAll('.bili-modal-close, #bili-stopwords-cancel-btn').forEach((btn) =>
      btn.addEventListener('click', () => this.closeStopWordsEditor())
    );
    this.stopWordsEditorModal.addEventListener('click', (e) => {
      if (e.target === this.stopWordsEditorModal) this.closeStopWordsEditor();
    });
    this.stopWordsEditorModal.querySelector('#bili-stopwords-save-btn').addEventListener('click', () => this.saveStopWordsFile());
    document.body.appendChild(this.stopWordsEditorModal);
    setTimeout(() => this.stopWordsEditorModal.classList.add('visible'), 10);
  }

  closeStopWordsEditor() {
    this.stopWordsEditorModal?.classList.remove('visible');
  }

  async saveStopWordsFile() {
    const contentInput = this.stopWordsEditorModal.querySelector('#bili-stopwords-content').value;
    try {
      this.configService.setStopWordsCache(contentInput);
      this.textEngine.stopWordsFileContent = contentInput;
      await this.textEngine.loadStopWordsFromFile();
      this.closeStopWordsEditor();
      await this.handleReloadButtonClick();
    } catch (error) {
      console.error('[saveStopWordsFile] Error:', error.message);
      alert('保存失败：' + error.message);
    }
  }

  // ---------------- Utils ----------------

  async handleReloadButtonClick() {
    const modalBody = this.ui.modal.querySelector('.bili-modal-body');
    modalBody.innerHTML = '<div class="bili-loading">正在重新读取B站数据...</div>';
    try {
      await this.textEngine.loadStopWordsFromFile();
      const data = await this.fetchDataByScene();
      if (data.titles.length) {
        const results = await this.analyzeTitles(data.titles);
        this.renderAnalysisResults(results, data.videos);
      } else {
        modalBody.innerHTML = '<div class="bili-error">未找到近期记录</div>';
      }
    } catch (error) {
      modalBody.innerHTML = `<div class="bili-error">获取数据失败：${error.message}</div>`;
    }
  }

  closeModal() {
    if (this.ui.modal) {
      this.ui.modal.classList.remove('visible');
      document.body.style.overflow = '';
      this.originalVideos = [];
      this.currentFilterKeyword = null;
    }
  }

  toggleTheme() {
    const current = this.configService.getTheme();
    const next = current === 'light' ? 'dark' : 'light';
    this.configService.setTheme(next);
    this.ui.applyTheme(this.ui.modal, next);
    this.applyThemeToAbout();
  }

  init() {
    this.handleLocationChange();
    this.hookNavigation();
  }
}

// 启动入口
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
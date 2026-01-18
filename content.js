let currentBvid = '';
let exportButton = null;

function getBvidFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('bvid');
}

function createButton() {
  if (exportButton) return;

  exportButton = document.createElement('button');
  exportButton.className = 'bili-exporter-btn';
  exportButton.textContent = '转普通页';
  exportButton.addEventListener('click', handleButtonClick);
  document.body.appendChild(exportButton);
}

function handleButtonClick() {
  if (currentBvid) {
    const targetUrl = `https://www.bilibili.com/video/${currentBvid}`;
    window.open(targetUrl, '_blank');
  }
}

function updateButtonVisibility() {
  const bvid = getBvidFromUrl();
  
  if (bvid && bvid !== currentBvid) {
    currentBvid = bvid;
    if (!exportButton) {
      createButton();
    }
    exportButton.classList.add('visible');
  } else if (!bvid) {
    currentBvid = '';
    if (exportButton) {
      exportButton.classList.remove('visible');
    }
  }
}

function init() {
  updateButtonVisibility();
  
  setInterval(() => {
    updateButtonVisibility();
  }, 500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
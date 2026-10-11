'use strict';
let creating;
async function ensureOffscreen() {
  const url = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url]});
  if (contexts.length) return;
  if (!creating) creating = chrome.offscreen.createDocument({url: 'offscreen.html', reasons: ['WORKERS'],
    justification: '在擴充功能內執行離線 OCR 模型'}).finally(() => { creating = undefined; });
  await creating;
}
function validTab(sender) {
  try {
    const url = new URL(sender.url);
    return sender.id === chrome.runtime.id && Number.isInteger(sender.tab?.id)
      && url.origin === 'https://postserv.post.gov.tw'
      && url.pathname === '/pstmail/main_mail.html';
  } catch { return false; }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target === 'background' && message.type === 'progress'
      && sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('offscreen.html')) {
    chrome.tabs.sendMessage(message.tabId, {type: 'ocr-progress', id: message.id, stage: message.stage}).catch(() => {});
    return;
  }
  if (message?.target !== 'background' || message.type !== 'ocr' || !validTab(sender)) return;
  if (typeof message.image !== 'string' || message.image.length > 2_000_000
      || !message.image.startsWith('data:image/png;base64,')) {
    respond({error: '圖片資料無效或過大。'}); return;
  }
  (async () => {
    await ensureOffscreen();
    const result = await chrome.runtime.sendMessage({target: 'offscreen', type: 'ocr',
      id: message.id, image: message.image, tabId: sender.tab.id});
    if (!result) throw new Error('OCR 未回傳結果。');
    return result;
  })().then(respond, error => respond({error: error.message || String(error)}));
  return true;
});

'use strict';
let worker;
const pending = new Map();
let sequence = 0;
function failAll(reason) {
  worker?.terminate(); worker = undefined;
  for (const job of pending.values()) { clearTimeout(job.timer); job.respond({error: reason}); }
  pending.clear();
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker(chrome.runtime.getURL('ocr-worker.js'));
  worker.addEventListener('error', event => failAll(event.message || '擴充功能 OCR Worker 啟動失敗。'));
  worker.addEventListener('message', ({data}) => {
    const job = pending.get(data.key);
    if (!job) return;
    if (data.stage) {
      chrome.runtime.sendMessage({target: 'background', type: 'progress',
        tabId: job.tabId, id: job.id, stage: data.stage}).catch(() => {});
    } else {
      clearTimeout(job.timer); pending.delete(data.key); job.respond(data.result);
    }
  });
  return worker;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.target !== 'offscreen' || message.type !== 'ocr') return;
  const key = ++sequence;
  const timer = setTimeout(() => failAll('OCR 逾時（60 秒），可按重新辨識重試。'), 60000);
  pending.set(key, {respond, timer, id: message.id, tabId: message.tabId});
  try { getWorker().postMessage({key, image: message.image}); }
  catch (error) { failAll(error.message); }
  return true;
});

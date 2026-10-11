(async () => {
  'use strict';
  let preferenceError = false;
  let savedAutoQuery = false;
  try {
    const settings = await chrome.storage.local.get('autoQueryEnabled');
    savedAutoQuery = settings.autoQueryEnabled === true;
  } catch (error) { preferenceError = true; console.warn('[郵件追蹤外掛] 無法讀取偏好', error); }
  const initialParams = new URL(location.href).searchParams;
  let autoEnabled = initialParams.has('autosubmit') ? initialParams.get('autosubmit') === '1' : savedAutoQuery;
  let preferenceApplied = false;
  let preferenceWrites = Promise.resolve();
  const visible = element => !!element?.isConnected && element.getClientRects().length > 0;
  // The official SPA switches controllers without updating targetTxn in the URL.
  function currentTxn() {
    if (document.querySelector('[ng-controller="EB500200Controller"]')) return 'EB500200';
    if (document.querySelector('[ng-controller="EB500100Controller"]')) return 'EB500100';
    return '';
  }
  const mailInputs = () => currentTxn() === 'EB500100'
    ? [1, 2, 3, 4, 5].map(index => document.querySelector(`#MAILNO${index}`))
    : [document.querySelector('#MAILNO')];
  const queryView = () => !!currentTxn() && mailInputs().some(visible);
  const imageSelector = 'img[src*="jcaptcha?"]';
  const edits = new WeakMap(), bound = new WeakSet();
  let generation = 0, currentImage, currentSrc, currentInput, currentOCRTxn, lastQueryInput, lastQueryTxn;
  let panel, status, diagnostic, autoOption, autoState, activeId, phase;
  let ocrValue = '', ocrInput;
  let autoSubmitConsumed = false;
  const maxFailures = 5;
  let consecutiveFailures = 0, retryTimer, automaticRefresh = false;
  let submittedCaptcha, automaticSubmit = false, retryingRejection = false;
  const captchaError = () => {
    const error = document.querySelector('[ng-if="inputVO.captcha_errMsg"]');
    return visible(error) ? error.textContent.trim() : '';
  };
  function cancelRetry() { clearTimeout(retryTimer); retryTimer = undefined; }
  function resetRetries() { cancelRetry(); consecutiveFailures = 0; retryingRejection = false; }
  function recognitionFailed(input, reason, valid, alreadyRefreshed = false) {
    cancelRetry();
    consecutiveFailures++;
    if (consecutiveFailures >= maxFailures) {
      status.textContent = `錯誤：連續 ${maxFailures} 次辨識失敗，已停止自動更新。${reason} 請手動輸入，或按重新辨識／官方更新按鈕重試。`;
      return;
    }
    if (alreadyRefreshed) {
      status.textContent = `辨識失敗（${consecutiveFailures}/${maxFailures}）：${reason} 等待官方新驗證碼辨識…`;
      return;
    }
    const refresh = document.querySelector('[ng-click^="recaptcha("]');
    if (!visible(refresh)) {
      status.textContent = `辨識失敗（${consecutiveFailures}/${maxFailures}）：${reason} 找不到官方更新按鈕，請手動更新。`;
      return;
    }
    status.textContent = `辨識失敗（${consecutiveFailures}/${maxFailures}）：${reason} 即將重新產生驗證碼…`;
    const revision = edits.get(input) || 0;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (!valid() || input.value || (edits.get(input) || 0) !== revision || !visible(refresh)) return;
      automaticRefresh = true;
      try { refresh.click(); } finally { automaticRefresh = false; }
    }, 500);
  }
  function checkCaptchaRejection(image) {
    const attempt = submittedCaptcha, input = document.querySelector('#captcha'), error = captchaError();
    if (!attempt || !queryView() || input !== attempt.input || currentTxn() !== attempt.txn) return;
    if (!/(驗證碼|验证码|captcha)/i.test(error) || !/(不正確|錯誤|incorrect|invalid)/i.test(error)) return;
    const changed = image?.src !== attempt.src;
    if (!changed && error === attempt.error) return;
    submittedCaptcha = undefined;
    if (input.value && input.value !== attempt.code && !(input === ocrInput && input.value === ocrValue)) return;
    generation++;
    retryingRejection = true;
    if (attempt.automatic) autoSubmitConsumed = false;
    setInput(input, ''); ocrInput = undefined;
    const txn = currentTxn(), src = image?.src;
    recognitionFailed(input, '官方回報驗證碼不正確。', () => queryView() && currentTxn() === txn
      && document.querySelector('#captcha') === input && image?.src === src, changed);
    return changed;
  }
  function setInput(input, value) {
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }
  const normalize = value => value.trim().replace(/\s+/g, '').toUpperCase();
  const validMailno = (code, txn) => txn === 'EB500100'
    ? /^(?:[0-9]{14}|[0-9]{20})$/.test(code) : /^[A-Z][A-Z0-9]{12}$/.test(code);
  function clearAutoSubmit() {
    const url = new URL(location.href);
    if (!url.searchParams.has('autosubmit')) return;
    url.searchParams.delete('autosubmit');
    history.replaceState(history.state, '', url.href);
    syncAutoOption();
  }
  function syncAutoOption() {
    if (autoOption) autoOption.checked = autoEnabled;
    if (autoState) autoState.textContent = (autoEnabled ? '（已啟用）' : '（未啟用）')
      + (preferenceError ? '（偏好儲存失敗）' : '');
  }
  function autoSubmitRequested() {
    if (autoSubmitConsumed || !queryView()) return false;
    const params = new URL(location.href).searchParams;
    if (params.get('autosubmit') !== '1') return false;
    const supplied = params.get('mailno') || params.get('MAILNO');
    if (!supplied) return false;
    const inputs = mailInputs(), codes = supplied.split(',').map(normalize), txn = currentTxn();
    return codes.length <= inputs.length && codes.some(Boolean)
      && codes.every(code => !code || validMailno(code, txn))
      && inputs.every((input, index) => normalize(input?.value || '') === (codes[index] || ''));
  }
  function scheduleAutoSubmit(input, code, isCurrent) {
    if (!autoSubmitRequested()) return;
    const revision = edits.get(input) || 0;
    // Let Angular process the input event before clicking its official query control.
    setTimeout(() => {
      if (!isCurrent() || !autoSubmitRequested() || input.value !== code
          || (edits.get(input) || 0) !== revision) return;
      const action = document.querySelector('[ng-click="doSubmit()"]');
      if (!visible(action)) return;
      autoSubmitConsumed = true;
      // Consume only the in-memory attempt. Keep the URL opt-in until the user
      // explicitly returns from the official result page.
      status.textContent = '已填入驗證碼，正在自動查詢…';
      syncUrl();
      automaticSubmit = true;
      try { action.click(); } finally { automaticSubmit = false; }
    }, 0);
  }
  function syncUrl() {
    if (!queryView()) return;
    const txn = currentTxn(), inputs = mailInputs();
    const codes = inputs.map(input => normalize(input?.value || ''));
    if (!codes.some(Boolean) || codes.some(code => code && !validMailno(code, txn))) return;
    inputs.forEach((input, index) => setInput(input, codes[index]));
    // Keep empty slots in the middle; omit unused slots at the end.
    while (codes.at(-1) === '') codes.pop();
    const url = new URL(location.href);
    url.searchParams.set('targetTxn', txn);
    url.searchParams.delete('MAILNO'); url.searchParams.set('mailno', codes.join(','));
    history.replaceState(history.state, '', url.href);
  }
  function fillFromUrl() {
    const params = new URL(location.href).searchParams;
    const supplied = params.get('mailno') || params.get('MAILNO');
    if (!supplied) return;
    const txn = currentTxn(), inputs = mailInputs(), codes = supplied.split(',').map(normalize);
    if (codes.length > inputs.length || !codes.some(Boolean)
        || codes.some(code => code && !validMailno(code, txn))) {
      console.warn('[郵件追蹤外掛] mailno 參數格式不符；國內限五筆 14 或 20 碼數字，國際限一筆 13 碼英數字。');
      return;
    }
    inputs.forEach((input, index) => setInput(input, codes[index] || ''));
  }
  function createPanel(input) {
    if (panel?.isConnected && input.parentElement.contains(panel)) { syncAutoOption(); return; }
    panel?.remove();
    panel = document.createElement('div'); panel.id = 'post-ddddocr-extension';
    const autoLabel = document.createElement('label');
    autoLabel.style.display = 'block'; autoLabel.style.marginBottom = '6px';
    autoOption = document.createElement('input'); autoOption.type = 'checkbox';
    autoOption.id = 'post-auto-submit-option';
    // Official styles hide checkbox inputs for their custom controls. Keep this
    // standalone native checkbox visible, including its keyboard focus ring.
    autoOption.style.cssText = [
      'display:inline-block!important', 'visibility:visible!important', 'opacity:1!important',
      'appearance:auto!important', '-webkit-appearance:checkbox!important',
      'position:static!important', 'width:18px!important', 'height:18px!important',
      'margin:0 6px 0 0!important', 'padding:0!important', 'vertical-align:middle!important',
      'clip:auto!important', 'clip-path:none!important', 'transform:none!important',
    ].join(';');
    autoOption.addEventListener('change', () => {
      autoEnabled = autoOption.checked;
      const url = new URL(location.href);
      if (autoEnabled) url.searchParams.set('autosubmit', '1');
      else url.searchParams.delete('autosubmit');
      history.replaceState(history.state, '', url.href);
      syncAutoOption();
      const enabled = autoEnabled;
      preferenceWrites = preferenceWrites.then(() => chrome.storage.local.set({autoQueryEnabled: enabled}))
        .then(() => { savedAutoQuery = enabled; preferenceError = false; syncAutoOption(); })
        .catch(error => { preferenceError = true; syncAutoOption(); console.warn('[郵件追蹤外掛] 無法儲存偏好', error); });
    });
    const autoText = document.createElement('span'); autoText.textContent = ' 自動查詢';
    autoState = document.createElement('span');
    const autoHelp = document.createElement('span'); autoHelp.textContent = '：有追蹤碼時自動送出，驗證碼失敗最多五次';
    autoLabel.append(autoOption, autoText, autoState, autoHelp); syncAutoOption();
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新辨識';
    retry.addEventListener('click', () => {
      submittedCaptcha = undefined;
      resetRetries();
      // Clear only a value we filled and the user has not edited.
      if (input === ocrInput && input.value === ocrValue) setInput(input, '');
      recognize(document.querySelector(imageSelector));
    });
    status = document.createElement('span'); status.setAttribute('role', 'status'); status.style.marginLeft = '8px';
    const details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = 'OCR 診斷（離線 beta 3.4.3）';
    diagnostic = document.createElement('pre'); diagnostic.style.whiteSpace = 'pre-wrap';
    details.append(summary, diagnostic); panel.append(autoLabel, retry, status, details); input.parentElement.append(panel);
  }
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'ocr-progress' && message.id === activeId) phase = message.stage;
  });
  async function recognize(image) {
    const input = document.querySelector('#captcha');
    if (!image?.complete || !image.naturalWidth || !visible(input) || !queryView()) return;
    checkCaptchaRejection(image);
    if (consecutiveFailures >= maxFailures) return;
    cancelRetry();
    const token = ++generation, src = image.src, txn = currentTxn(), revision = edits.get(input) || 0;
    const valid = () => token === generation && currentTxn() === txn && queryView() && image.isConnected
      && image.src === src && document.querySelector('#captcha') === input;
    if (input.value) { status.textContent = '保留已輸入的驗證碼；清空後可重新辨識。'; return; }
    const targetStatus = status, targetDiagnostic = diagnostic;
    const id = crypto.randomUUID(); activeId = id; phase = '啟動離線 OCR';
    const started = Date.now();
    const update = () => { if (valid()) targetStatus.textContent = `${phase} · 已用 ${Math.floor((Date.now() - started) / 1000)} 秒`; };
    update(); const timer = setInterval(update, 500);
    let timeout;
    try {
      if (image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error('圖片尺寸超出限制。');
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const request = chrome.runtime.sendMessage({target: 'background', type: 'ocr', id,
        image: canvas.toDataURL('image/png')});
      const result = await Promise.race([request, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('OCR 未回應（65 秒），請重新辨識或重新載入擴充功能。')), 65000);
      })]);
      if (!valid()) return;
      if (result?.error) throw new Error(result.error);
      if (typeof result?.text !== 'string') throw new Error('OCR 回應格式不符。');
      targetDiagnostic.textContent = JSON.stringify(result, null, 2);
      if ((edits.get(input) || 0) !== revision || input.value) {
        targetStatus.textContent = '已保留你手動輸入的驗證碼。'; return;
      }
      if (!/^[0-9]{4}$/.test(result.text)) {
        recognitionFailed(input, `未辨識出四碼數字（結果：${result.text || '空白'}）。`, valid); return;
      }
      if (!retryingRejection) resetRetries();
      setInput(input, result.text); ocrInput = input; ocrValue = result.text;
      targetStatus.textContent = `已填入 ${result.text}，請核對後按 Enter 查詢。`;
      scheduleAutoSubmit(input, result.text, valid);
    } catch (error) {
      if (valid()) {
        targetDiagnostic.textContent = JSON.stringify({version: '3.4.3', stage: phase, error: error.message || String(error)}, null, 2);
        if ((edits.get(input) || 0) !== revision || input.value) {
          targetStatus.textContent = '已保留你手動輸入的驗證碼。';
        } else recognitionFailed(input, `OCR 失敗：${error.message || String(error)}`, valid);
      }
    } finally { clearInterval(timer); clearTimeout(timeout); if (activeId === id) activeId = undefined; }
  }
  function inspect() {
    const txn = currentTxn();
    if (!txn) {
      submittedCaptcha = undefined;
      resetRetries();
      generation++; lastQueryInput = lastQueryTxn = undefined;
      if (panel?.isConnected) panel.remove();
      currentImage = currentInput = currentOCRTxn = undefined; currentSrc = '';
      return;
    }
    const mailInput = mailInputs().find(visible);
    if (!visible(mailInput)) {
      submittedCaptcha = undefined;
      resetRetries();
      lastQueryInput = undefined; generation++;
      return;
    }
    if (!preferenceApplied) {
      preferenceApplied = true;
      if (autoEnabled && !autoSubmitConsumed) {
        const url = new URL(location.href);
        url.searchParams.set('autosubmit', '1');
        history.replaceState(history.state, '', url.href);
      }
    }
    if (mailInput !== lastQueryInput || txn !== lastQueryTxn) {
      submittedCaptcha = undefined;
      resetRetries();
      lastQueryInput = mailInput; lastQueryTxn = txn; fillFromUrl();
    }
    const input = document.querySelector('#captcha'), image = document.querySelector(imageSelector);
    if (!visible(input) || !image) return;
    createPanel(input);
    const rejectedNewImage = checkCaptchaRejection(image);
    if (!edits.has(input)) {
      edits.set(input, 0);
      input.addEventListener('input', () => {
        if (retryTimer !== undefined && status) status.textContent = '已停止自動更新；可手動輸入或按重新辨識。';
        cancelRetry(); edits.set(input, (edits.get(input) || 0) + 1); ocrInput = undefined;
      });
    }
    if (!bound.has(image)) {
      bound.add(image);
      image.addEventListener('load', () => {
        if (document.querySelector(imageSelector) === image && image === currentImage) {
          currentSrc = image.src;
          recognize(image);
        }
      });
      image.addEventListener('error', () => { if (status) status.textContent = '驗證碼圖片載入失敗，請按官方更新按鈕。'; });
    }
    if (rejectedNewImage || image !== currentImage || image.src !== currentSrc || input !== currentInput || currentOCRTxn !== txn) {
      generation++; currentImage = image; currentSrc = image.src; currentInput = input; currentOCRTxn = txn;
      if (image.complete && image.naturalWidth) recognize(image);
    }
  }
  document.addEventListener('click', event => {
    const control = event.target?.closest?.('[ng-click]'), action = control?.getAttribute('ng-click') || '';
    if (/^\s*doSubmit\s*\(/.test(action) && queryView()) {
      const input = document.querySelector('#captcha');
      submittedCaptcha = {input, code: input?.value, src: document.querySelector(imageSelector)?.src,
        txn: currentTxn(), error: captchaError(), automatic: automaticSubmit};
      cancelRetry(); generation++;
      autoSubmitConsumed = true;
      syncUrl();
    }
    if (/^\s*doBack\s*\(/.test(action) && currentTxn() && !queryView()) {
      autoSubmitConsumed = true;
      preferenceApplied = true;
      clearAutoSubmit();
    }
    if (/^\s*recaptcha\s*\(/.test(action) && queryView()) {
      if (!automaticRefresh) { resetRetries(); submittedCaptcha = undefined; }
      generation++; setInput(document.querySelector('#captcha'), ''); ocrInput = undefined;
      if (status) status.textContent = '等待新驗證碼圖片載入…';
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    if (!currentTxn()) return;
    const query = queryView();
    const action = document.querySelector(query ? '[ng-click="doSubmit()"]' : '[ng-click="doBack()"]');
    if (!visible(action)) return;
    if (query) {
      if (event.target?.id !== 'captcha' && !mailInputs().includes(event.target)) return;
    } else {
      const interactive = event.target?.closest?.('a,button,input,textarea,select,[contenteditable="true"],[role="button"]');
      if (interactive && interactive !== action) return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return;
    if (query) { syncUrl(); const captcha = document.querySelector('#captcha'); setInput(captcha, captcha?.value || ''); }
    action.click();
  }, true);
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true; setTimeout(() => { scheduled = false; inspect(); }, 0);
  }).observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'class', 'style', 'hidden', 'ng-controller']});
  window.addEventListener('popstate', () => { syncAutoOption(); if (queryView()) fillFromUrl(); });
  inspect();
})();

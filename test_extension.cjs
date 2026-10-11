const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}/tw-post-extension/content.js`, 'utf8');
async function scenario(mode, stored = {}) {
  let page = 'query', domestic = mode.startsWith('domestic');
  let international = mode !== 'switch' && !domestic, requests = [], submissions = 0, backs = 0, observer;
  const flagsAtSubmit = [];
  const handlers = {}, timers = [], delayed = new Map(); let timerId = 0, refreshes = 0;
  const location = {href: 'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500200&keep=1#test'};
  function element(tag) {
    return {tag, style: {}, value: '', children: [], listeners: {}, isConnected: true,
      getClientRects() { return [1]; }, setAttribute() {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      dispatchEvent(event) { this.listeners[event.type]?.(event); },
      append(...children) { this.children.push(...children); children.forEach(c => c.parentElement = this); },
      contains(child) { return this.children.includes(child); },
      remove() { this.isConnected = false; },
      getContext() { return {drawImage() {}}; },
      toDataURL() { return 'data:image/png;base64,dGVzdA=='; }};
  }
  const parent = element('div');
  const officialError = element('span'); officialError.textContent = '';
  let mail = element('input'), mails = [], captcha = element('input'), image = element('img');
  function form() {
    mails = domestic ? Array.from({length: 5}, (_, i) => {
      const input = i === 0 ? mail : element('input'); input.id = `MAILNO${i + 1}`; return input;
    }) : [mail];
    mail.id = domestic ? 'MAILNO1' : 'MAILNO'; captcha.id = 'captcha'; captcha.parentElement = parent;
    image.src = 'https://postserv.post.gov.tw/pstmail/jcaptcha?uuid=1';
    image.complete = true; image.naturalWidth = 162; image.naturalHeight = 54;
  }
  form();
  const control = action => ({getAttribute: () => action, closest() { return this; }, getClientRects: () => [1], isConnected: true});
  const submit = control('doSubmit()');
  submit.click = () => {
    flagsAtSubmit.push(new URL(location.href).searchParams.get('autosubmit'));
    handlers.click({target: submit}); submissions++; page = mode === 'autoRejected' || mode.includes('Validation') ? 'query' : 'result';
  };
  const back = control('doBack()');
  const refresh = control('recaptcha();');
  refresh.click = () => {
    handlers.click({target: refresh}); refreshes++;
    image.src += `-${refreshes}`; image.listeners.load();
  };
  back.click = () => { handlers.click({target: back}); backs++; page = 'query'; mail = element('input'); captcha = element('input'); image = element('img'); form(); };
  const body = element('body');
  const document = {body, createElement: element, addEventListener(type, fn) { handlers[type] = fn; },
    querySelector(selector) {
      if (selector === '[ng-controller="EB500200Controller"]') return international ? parent : null;
      if (selector === '[ng-controller="EB500100Controller"]') return domestic ? parent : null;
      if (selector === '#MAILNO') return page === 'query' && !domestic ? mail : null;
      if (/^#MAILNO[1-5]$/.test(selector)) return page === 'query' && domestic ? mails[Number(selector.at(-1)) - 1] : null;
      if (selector === '#captcha') return page === 'query' ? captcha : null;
      if (selector === '[ng-if="inputVO.captcha_errMsg"]') return officialError;
      if (selector.startsWith('img[')) return page === 'query' ? image : null;
      if (selector.includes('doSubmit')) return page === 'query' ? submit : null;
      if (selector.includes('doBack')) return page === 'result' ? back : null;
      if (selector.includes('recaptcha(')) return page === 'query' ? refresh : null;
      return null;
    }};
  const context = {document, location, history: {state: {keep: true}, replaceState(state, _, url) {
    assert.deepEqual(state, {keep: true}); location.href = url;
  }}, window: {addEventListener() {}}, URL, crypto: {randomUUID: () => `id-${requests.length}`},
    Event: class {constructor(type) { this.type = type; }},
    MutationObserver: class {constructor(fn) { observer = fn; } observe() {}},
    chrome: {storage: {local: {async get() {return {...stored};}, async set(settings) {Object.assign(stored, settings);}}},
      runtime: {onMessage: {addListener() {}}, sendMessage(message) {
      return new Promise(resolve => requests.push({message, resolve}));
    }}}, setTimeout(fn, ms) {
      const id = ++timerId;
      if (!ms) timers.push(fn); else delayed.set(id, {fn, ms});
      return id;
    }, clearTimeout(id) { delayed.delete(id); },
    setInterval() { return 1; }, clearInterval() {}, console};
  if (mode === 'url') location.href = 'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500200&mailno=en544513815jp';
  if (mode === 'spa' || mode === 'switch') location.href = 'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100&keep=1#test';
  const domesticCodes = ['12345678901234', '00123456789012345678', '', '00000000000001', ''];
  if (domestic) location.href = 'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100&keep=1#test';
  if (mode === 'domesticUrl') location.href = 'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100&mailno=' + domesticCodes.slice(0, 4).join(',');
  if (mode === 'domesticOverflow') location.href = 'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100&mailno=' + Array(6).fill(domesticCodes[0]).join(',');
  if (mode === 'option' || mode === 'domesticOption' || mode === 'savedAuto' || mode === 'domesticSavedAuto') {
    const url = new URL(location.href);
    url.searchParams.set('mailno', domestic ? domesticCodes.slice(0, 4).join(',') : 'EN544513815JP');
    location.href = url.href;
  }
  const autoMode = mode.startsWith('auto') || mode === 'domesticAuto' || mode.startsWith('domesticValidation');
  const autoSuccess = ['auto', 'autoBackClick', 'autoRejected', 'domesticAuto', 'savedAuto', 'domesticSavedAuto'].includes(mode);
  if (autoMode) {
    const url = new URL(location.href);
    url.searchParams.set('autosubmit', mode === 'autoWrongFlag' ? '0' : '1');
    if (mode !== 'autoNoMail') url.searchParams.set('mailno', mode === 'autoInvalid' ? 'bad'
      : domestic ? domesticCodes.slice(0, 4).join(',') : 'en544513815jp');
    location.href = url.href;
  }
  await vm.runInNewContext(source, context);
  const flush = async () => {
    for (let i = 0; i < 8; i++) { while (timers.length) timers.shift()(); await Promise.resolve(); }
  };
  const inspect = async () => { observer(); await flush(); };
  const advanceRetry = async () => {
    for (const [id, timer] of [...delayed]) if (timer.ms === 500) {
      delayed.delete(id); timer.fn();
    }
    await flush();
  };
  const enter = (target, extra = {}) => {
    const event = {key: 'Enter', target, preventDefault() {}, stopImmediatePropagation() {}, ...extra}; handlers.keydown(event);
  };
  const option = () => parent.children.filter(child => child.id === 'post-ddddocr-extension' && child.isConnected)
    .at(-1)?.children[0].children[0];
  if (mode === 'switch') {
    assert.equal(requests.length, 0, 'domestic page must not run international OCR');
    enter(mail); assert.equal(submissions, 0);
    international = true; await inspect();
  }
  assert.equal(requests.length, 1, 'OCR must start without mailno URL');
  assert.equal(option().checked, autoMode ? mode !== 'autoWrongFlag' : stored.autoQueryEnabled === true,
    'checkbox reflects explicit URL or saved preference');
  if (mode === 'url') assert.equal(mail.value, 'EN544513815JP');
  if (mode === 'domesticUrl') assert.deepEqual(mails.map(input => input.value), domesticCodes);
  if (mode === 'domesticOverflow') assert.ok(mails.every(input => !input.value), 'reject excess URL slots without partial filling');
  if (mode === 'manual' || mode === 'domesticManual' || mode === 'autoManual') { captcha.value = '9876'; captcha.dispatchEvent(new context.Event('input')); }
  if (mode === 'autoMailEdit') mail.value = 'EM293984075JP';
  if (mode === 'stale') image.src += 'changed';
  const firstCaptcha = captcha;
  if (mode.includes('Retry')) {
    const status = () => parent.children.filter(child => child.id === 'post-ddddocr-extension' && child.isConnected).at(-1).children[2];
    const fail = async () => { requests.at(-1).resolve(mode === 'errorRetry' ? {error: 'worker failed'} : {text: '123'}); await flush(); };
    await fail(); assert.match(status().textContent, /1\/5/);
    if (mode === 'manualRetry') {
      captcha.value = '9876'; captcha.dispatchEvent(new context.Event('input'));
      await advanceRetry(); assert.equal(refreshes, 0); assert.equal(captcha.value, '9876'); return;
    }
    if (mode === 'leaveRetry') {
      page = 'result'; await inspect(); await advanceRetry(); assert.equal(refreshes, 0); return;
    }
    await advanceRetry(); assert.equal(refreshes, 1); assert.equal(requests.length, 2);
    await inspect(); assert.equal(requests.length, 2, 'load plus observer must not repeat OCR');
    if (mode === 'successRetry' || mode === 'autoRetry') {
      requests.at(-1).resolve({text: '4815'}); await flush();
      assert.equal(captcha.value, '4815'); assert.equal(submissions, mode === 'autoRetry' ? 1 : 0);
      if (mode === 'successRetry') {
        refresh.click(); await fail(); assert.match(status().textContent, /1\/5/);
      }
      return;
    }
    for (let attempt = 2; attempt <= 5; attempt++) {
      await fail();
      if (attempt < 5) { assert.match(status().textContent, new RegExp(`${attempt}/5`)); await advanceRetry(); }
    }
    assert.match(status().textContent, /連續 5 次辨識失敗/);
    await advanceRetry(); await inspect(); image.listeners.load(); await flush();
    assert.equal(refreshes, 4); assert.equal(requests.length, 5); assert.equal(submissions, 0);
    if (mode === 'buttonRetry') {
      parent.children.filter(child => child.id === 'post-ddddocr-extension' && child.isConnected).at(-1).children[1].listeners.click();
    } else refresh.click();
    assert.equal(requests.length, 6, 'manual refresh or retry button resets stopped retries');
    await fail(); assert.match(status().textContent, /1\/5/);
    return;
  }
  requests[0].resolve(mode === 'error' || mode === 'autoError' ? {error: 'model missing'}
    : {text: mode === 'autoMalformed' ? '123' : '0123', elapsed_ms: 16});
  await flush();
  if (mode.includes('Validation')) {
    if (mode.startsWith('manual')) { mail.value = 'EN544513815JP'; submit.click(); }
    assert.equal(submissions, 1);
    const status = () => parent.children.filter(child => child.id === 'post-ddddocr-extension' && child.isConnected).at(-1).children[2];
    const reject = async (changeImage = true) => {
      officialError.textContent = '驗證碼不正確'; captcha.value = '';
      if (changeImage) { image.src += '-official'; image.listeners.load(); }
      await inspect();
    };
    if (mode === 'autoValidationManualEdit') {
      officialError.textContent = '驗證碼不正確'; captcha.value = '9876';
      captcha.dispatchEvent(new context.Event('input')); image.src += '-official'; image.listeners.load(); await inspect();
      assert.equal(captcha.value, '9876'); assert.equal(submissions, 1); assert.equal(requests.length, 1); return;
    }
    if (mode === 'autoValidationNoRefresh') {
      await reject(false); await advanceRetry();
      assert.equal(refreshes, 1); assert.equal(requests.length, 2);
      requests.at(-1).resolve({text: '4815'}); await flush(); assert.equal(submissions, 2); return;
    }
    if (mode === 'autoValidationLateError') {
      captcha.value = ''; image.src += '-official'; image.listeners.load();
      const earlyRequest = requests.at(-1);
      officialError.textContent = '驗證碼不正確'; await inspect();
      assert.equal(requests.length, 3, 'late error invalidates early OCR and restarts the current image');
      earlyRequest.resolve({text: '1111'}); await flush(); assert.equal(captcha.value, '');
      requests.at(-1).resolve({text: '4815'}); await flush(); assert.equal(submissions, 2); return;
    }
    await reject(); assert.equal(requests.length, 2); assert.equal(refreshes, 0, 'reuse official regenerated CAPTCHA');
    if (mode === 'manualValidation') {
      requests.at(-1).resolve({text: '4815'}); await flush(); assert.equal(captcha.value, '4815');
      assert.equal(submissions, 1, 'manual mode does not automatically submit'); return;
    }
    if (mode === 'autoValidationSuccess') {
      requests.at(-1).resolve({text: '4815'}); await flush(); assert.equal(submissions, 2);
      page = 'result'; await inspect(); back.click(); await inspect();
      officialError.textContent = ''; requests.at(-1).resolve({text: '1111'}); await flush();
      assert.equal(submissions, 2); assert.equal(new URL(location.href).searchParams.has('autosubmit'), false); return;
    }
    if (mode === 'autoValidationMixed') {
      requests.at(-1).resolve({text: '123'}); await flush(); assert.match(status().textContent, /2\/5/);
      await advanceRetry(); requests.at(-1).resolve({text: '4815'}); await flush(); assert.equal(submissions, 2);
      await reject(); requests.at(-1).resolve({text: '123'}); await flush(); assert.match(status().textContent, /4\/5/);
      await advanceRetry(); requests.at(-1).resolve({text: ''}); await flush();
      assert.match(status().textContent, /連續 5 次/); await advanceRetry(); assert.equal(submissions, 2); return;
    }
    for (let failure = 2; failure <= 5; failure++) {
      requests.at(-1).resolve({text: '4815'}); await flush(); assert.equal(submissions, failure);
      await reject();
    }
    assert.match(status().textContent, /連續 5 次/);
    await inspect(); image.listeners.load(); await advanceRetry();
    assert.equal(submissions, 5); assert.equal(requests.length, 5); assert.equal(refreshes, 0);
    return;
  }
  assert.equal(submissions, autoSuccess ? 1 : 0, 'auto-submit requires valid opt-in URL and a four-digit OCR result');
  if (mode === 'manual' || mode === 'domesticManual' || mode === 'autoManual') assert.equal(captcha.value, '9876');
  else if (['stale', 'error', 'autoError', 'autoMalformed'].includes(mode)) assert.equal(captcha.value, '');
  else assert.equal(captcha.value, '0123');
  if (mode === 'option' || mode === 'domesticOption') {
    const original = new URL(location.href);
    option().checked = true; option().dispatchEvent(new context.Event('change'));
    let updated = new URL(location.href);
    assert.equal(updated.searchParams.get('autosubmit'), '1');
    assert.equal(updated.searchParams.get('mailno'), original.searchParams.get('mailno'));
    await flush(); assert.equal(stored.autoQueryEnabled, true, 'checked preference persists');
    assert.equal(updated.searchParams.get('keep'), '1'); assert.equal(updated.hash, '#test');
    assert.equal(submissions, 0, 'checkbox changes URL without submitting or reloading');
    option().checked = false; option().dispatchEvent(new context.Event('change'));
    updated = new URL(location.href);
    assert.equal(updated.searchParams.has('autosubmit'), false);
    assert.equal(updated.searchParams.get('mailno'), original.searchParams.get('mailno'));
    await flush(); assert.equal(stored.autoQueryEnabled, false, 'unchecked preference persists');
  }
  if (mode === 'submit' || mode === 'enter' || mode === 'spa' || mode === 'switch') {
    mail.value = 'en544513815jp';
    if (mode === 'enter') {
      enter(mail, {isComposing: true}); enter(mail, {repeat: true});
      assert.equal(submissions, 0);
      enter(mail);
    } else submit.click();
    assert.equal(submissions, 1);
    const url = new URL(location.href);
    assert.equal(url.searchParams.get('mailno'), 'EN544513815JP');
    assert.equal(url.searchParams.get('targetTxn'), 'EB500200');
    assert.equal(url.searchParams.get('keep'), '1'); assert.equal(url.hash, '#test');
    await inspect(); enter(body); await inspect();
    assert.equal(backs, 1); assert.equal(mail.value, 'EN544513815JP');
  }
  if (mode === 'domestic' || mode === 'domesticEnter') {
    mails.forEach((input, index) => input.value = domesticCodes[index]);
    if (mode === 'domesticEnter') enter(mails[4]); else submit.click();
    assert.equal(submissions, 1);
    const url = new URL(location.href);
    assert.equal(url.searchParams.get('targetTxn'), 'EB500100');
    assert.equal(url.searchParams.get('mailno'), domesticCodes.slice(0, 4).join(','));
    assert.equal(url.searchParams.get('keep'), '1'); assert.equal(url.hash, '#test');
    await inspect(); enter(body); await inspect();
    assert.equal(backs, 1); assert.deepEqual(mails.map(input => input.value), domesticCodes);
  }
  if (mode === 'refresh' || mode === 'domesticRefresh') {
    const refresh = control('recaptcha()');
    handlers.click({target: refresh}); assert.equal(captcha.value, '');
    image.src += '2'; image.listeners.load();
    requests.at(-1).resolve({text: '4815'}); await flush(); assert.equal(captcha.value, '4815');
  }
  if (mode === 'domesticSwitch') {
    // A queued recognition from the domestic page must not fill the new international input.
    handlers.click({target: control('recaptcha()')}); image.src += '2'; image.listeners.load();
    const old = requests.at(-1);
    domestic = false; international = true;
    mail = element('input'); captcha = element('input'); image = element('img'); form(); await inspect();
    old.resolve({text: '1111'}); await flush(); assert.equal(captcha.value, '');
    requests.at(-1).resolve({text: '2222'}); await flush(); assert.equal(captcha.value, '2222');
  }
  if (autoSuccess) {
    assert.equal(firstCaptcha.value, '0123');
    assert.deepEqual(flagsAtSubmit, ['1'], 'keep URL flag during official submit');
    assert.equal(new URL(location.href).searchParams.get('autosubmit'), '1');
    assert.ok(new URL(location.href).searchParams.get('mailno'));
    await inspect();
    assert.equal(new URL(location.href).searchParams.get('autosubmit'), '1', 'keep flag on results or CAPTCHA rejection');
    if (mode !== 'autoRejected') {
      if (mode === 'autoBackClick') back.click(); else enter(body);
      await inspect(); assert.equal(backs, 1);
    }
    assert.equal(new URL(location.href).searchParams.has('autosubmit'), mode === 'autoRejected',
      'remove flag only when returning from results');
    assert.equal(option().checked, true, 'return removes URL flag but preserves checkbox preference');
    if (domestic) assert.deepEqual(mails.map(input => input.value), domesticCodes);
    else assert.equal(mail.value, 'EN544513815JP');
    if (mode === 'autoRejected') {
      handlers.click({target: control('recaptcha()')}); image.src += 'retry'; image.listeners.load();
    }
    requests.at(-1).resolve({text: '4815'}); await flush();
    assert.equal(submissions, 1, 'returning or CAPTCHA rejection must not replay auto-submit');
  }
  if (mode === 'preferenceEnable' || mode === 'preferenceDisable') {
    option().checked = mode === 'preferenceEnable';
    option().dispatchEvent(new context.Event('change')); await flush();
    assert.equal(stored.autoQueryEnabled, mode === 'preferenceEnable');
  }
  if (mode === 'preferenceRestore') {
    assert.equal(option().checked, true);
    assert.equal(new URL(location.href).searchParams.get('autosubmit'), '1');
    // A manual query and return must not clear the persistent preference or replay.
    mail.value = 'EN544513815JP'; submit.click(); await inspect(); back.click(); await inspect();
    assert.equal(new URL(location.href).searchParams.has('autosubmit'), false);
    assert.equal(option().checked, true); assert.equal(stored.autoQueryEnabled, true);
    requests.at(-1).resolve({text: '4815'}); await flush(); assert.equal(submissions, 1);
  }
}
(async () => {
  for (const mode of ['url', 'submit', 'enter', 'manual', 'stale', 'error', 'refresh', 'spa', 'switch',
    'domestic', 'domesticEnter', 'domesticUrl', 'domesticOverflow', 'domesticManual', 'domesticRefresh', 'domesticSwitch',
    'auto', 'autoBackClick', 'domesticAuto', 'autoNoMail', 'autoInvalid', 'autoWrongFlag', 'autoManual', 'autoMailEdit', 'autoMalformed', 'autoError', 'autoRejected', 'option', 'domesticOption',
    'limitRetry', 'domesticRetry', 'errorRetry', 'manualRetry', 'leaveRetry', 'successRetry', 'autoRetry', 'buttonRetry',
    'autoValidationLimit', 'domesticValidationLimit', 'manualValidation', 'autoValidationSuccess',
    'autoValidationNoRefresh', 'autoValidationManualEdit', 'autoValidationMixed', 'autoValidationLateError']) await scenario(mode);
  const saved = {};
  await scenario('preferenceEnable', saved);
  await scenario('preferenceRestore', saved);
  await scenario('savedAuto', saved);
  await scenario('domesticSavedAuto', saved);
  await scenario('autoWrongFlag', saved);
  await scenario('preferenceDisable', saved);
  await scenario('preferenceDisabled', saved);
  console.log('PASS: domestic/international OCR, URL/Enter, preferences, bounded CAPTCHA rejection resubmission, mixed five-failure limit, late error handling, manual protection and no replay after results');
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
importScripts('vendor/ort.wasm.min.js', 'ocr-core.js');
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL('vendor/', self.location.href).href;
let sessionPromise, configPromise, queue = Promise.resolve();
async function recognize(message) {
  const stage = text => self.postMessage({key: message.key, stage: text});
  const started = performance.now();
  stage('載入本機 beta 模型');
  if (!configPromise) configPromise = fetch('model-config.json').then(response => {
    if (!response.ok) throw new Error('找不到模型設定；請先執行建置。');
    return response.json();
  }).catch(error => { configPromise = undefined; throw error; });
  if (!sessionPromise) sessionPromise = ort.InferenceSession.create('beta.onnx', {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all',
  }).catch(error => { sessionPromise = undefined; throw error; });
  const [session, config] = await Promise.all([sessionPromise, configPromise]);
  stage('處理驗證碼圖片');
  const encoded = atob(message.image.split(',')[1]);
  const bytes = Uint8Array.from(encoded, char => char.charCodeAt(0));
  const blob = new Blob([bytes], {type: 'image/png'});
  const bitmap = await createImageBitmap(blob);
  if (bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width * bitmap.height > 4_000_000) {
    bitmap.close(); throw new Error('圖片尺寸超出限制。');
  }
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0); bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const input = PostOCR.preprocess(pixels.data, canvas.width, canvas.height);
  stage('辨識四碼數字');
  const output = await session.run({[session.inputNames[0]]: new ort.Tensor('float32', input.tensor, input.dims)});
  const logits = output[session.outputNames[0]];
  const text = PostOCR.decode(logits.data, logits.dims, config.digits);
  return {text, model: 'ddddocr 1.5.6 beta', elapsed_ms: Math.round(performance.now() - started)};
}
self.addEventListener('message', ({data}) => {
  queue = queue.catch(() => {}).then(async () => {
    try { self.postMessage({key: data.key, result: await recognize(data)}); }
    catch (error) { self.postMessage({key: data.key, result: {error: error.message || String(error)}}); }
  });
});

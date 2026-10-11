/* Pure preprocessing and decoding, also used by the local verification tools. */
(function (root) {
  'use strict';
  const clamp = value => Math.max(0, Math.min(255, value));
  const sinc = x => x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
  function coefficients(input, output) {
    const scale = input / output, filterScale = Math.max(1, scale), support = 3 * filterScale;
    return Array.from({length: output}, (_, x) => {
      const center = (x + 0.5) * scale;
      const start = Math.max(0, Math.floor(center - support + 0.5));
      const end = Math.min(input, Math.floor(center + support + 0.5));
      const values = [];
      for (let i = start; i < end; i++) {
        const distance = (i - center + 0.5) / filterScale;
        values.push(Math.abs(distance) < 3 ? sinc(distance) * sinc(distance / 3) : 0);
      }
      const sum = values.reduce((a, b) => a + b, 0);
      return {start, weights: values.map(v => Math.floor(v / sum * 4194304 + 0.5))};
    });
  }
  function preprocess(rgba, width, height) {
    const targetWidth = Math.floor(width * 64 / height), targetHeight = 64;
    if (!width || !height || targetWidth < 1 || width * height > 4_000_000 || targetWidth > 4096) throw new Error('圖片尺寸不符。');
    const horizontal = coefficients(width, targetWidth), vertical = coefficients(height, targetHeight);
    const intermediate = new Uint8Array(targetWidth * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < targetWidth; x++) {
      const {start, weights} = horizontal[x];
      for (let c = 0; c < 3; c++) {
        let value = 2097152;
        for (let k = 0; k < weights.length; k++) value += rgba[(y * width + start + k) * 4 + c] * weights[k];
        intermediate[(y * targetWidth + x) * 3 + c] = clamp(Math.floor(value / 4194304));
      }
    }
    const tensor = new Float32Array(targetWidth * targetHeight);
    for (let y = 0; y < targetHeight; y++) for (let x = 0; x < targetWidth; x++) {
      const {start, weights} = vertical[y], rgb = [];
      for (let c = 0; c < 3; c++) {
        let value = 2097152;
        for (let k = 0; k < weights.length; k++) value += intermediate[((start + k) * targetWidth + x) * 3 + c] * weights[k];
        rgb.push(clamp(Math.floor(value / 4194304)));
      }
      const gray = Math.floor((rgb[0] * 19595 + rgb[1] * 38470 + rgb[2] * 7471 + 32768) / 65536);
      // Match NumPy's float32 operations, including intermediate rounding.
      tensor[y * targetWidth + x] = Math.fround(Math.fround(Math.fround(gray / 255) - 0.5) / 0.5);
    }
    return {tensor, dims: [1, 1, targetHeight, targetWidth]};
  }
  function decode(data, dims, digits) {
    const classes = dims[dims.length - 1];
    if (!classes || data.length % classes || digits.length !== 11) throw new Error('模型輸出形狀不符。');
    let text = '', last = -1;
    for (let offset = 0; offset < data.length; offset += classes) {
      let best = digits[0];
      for (const candidate of digits) if (data[offset + candidate.index] > data[offset + best.index]) best = candidate;
      if (best.index !== last && best.char !== '') text += best.char;
      last = best.index;
    }
    return text;
  }
  root.PostOCR = {preprocess, decode};
})(typeof self === 'object' ? self : globalThis);

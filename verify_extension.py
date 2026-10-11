#!/usr/bin/env python3
"""Verify JS preprocessing and CTC decoding against the real installed beta model."""
import base64
import json
from pathlib import Path
import subprocess
import numpy as np
import ddddocr
import onnxruntime
from PIL import Image

ROOT = Path(__file__).resolve().parent
sample = Image.open(ROOT / 'captcha-samples/sample-01.jpeg')
rgba = np.array(sample.convert('RGBA'))
script = r'''
require('./tw-post-extension/ocr-core.js');
let input = ''; process.stdin.on('data', value => input += value);
process.stdin.on('end', async () => {
  const payload = JSON.parse(input);
  if (payload.wasm) {
    const fs = require('node:fs'), ort = require('./tw-post-extension/vendor/ort.wasm.min.js');
    ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = require('node:url').pathToFileURL(`${process.cwd()}/tw-post-extension/vendor/`).href;
    try {
      const session = await ort.InferenceSession.create(fs.readFileSync('tw-post-extension/beta.onnx'), {executionProviders: ['wasm']});
      const bytes = Buffer.from(payload.tensor, 'base64');
      const tensor = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const outputs = await session.run({[session.inputNames[0]]: new ort.Tensor('float32', tensor, payload.dims)});
      const output = outputs[session.outputNames[0]];
      console.log(JSON.stringify({text: PostOCR.decode(output.data, output.dims, payload.digits), shape: output.dims}));
    } catch (error) { console.error(error); process.exitCode = 1; }
  } else if (payload.rgba) {
    const result = PostOCR.preprocess(payload.rgba, payload.width, payload.height);
    console.log(JSON.stringify({dims: result.dims, tensor: Buffer.from(result.tensor.buffer).toString('base64')}));
  } else console.log(JSON.stringify({text: PostOCR.decode(payload.data, payload.dims, payload.digits)}));
});
'''


def js(payload):
    result = subprocess.run(['node', '-e', script], cwd=ROOT, input=json.dumps(payload),
                            text=True, capture_output=True, check=True)
    assert 'VerifyOutputSizes' not in result.stderr, '模型輸出形狀仍有警告'
    return json.loads(result.stdout)


result = js({'width': sample.width, 'height': sample.height, 'rgba': rgba.reshape(-1).tolist()})
tensor = np.frombuffer(base64.b64decode(result['tensor']), dtype=np.float32).reshape(result['dims'])
expected = np.array(sample.resize((int(sample.width * 64 / sample.height), 64), Image.Resampling.LANCZOS).convert('L')).astype(np.float32)
expected = (expected / 255 - 0.5) / 0.5
error = float(np.max(np.abs(tensor[0, 0] - expected)))
engine = ddddocr.DdddOcr(show_ad=False, beta=True)
session = engine._DdddOcr__ort_session
output = session.run(None, {'input1': tensor})[0]
patched = onnxruntime.InferenceSession(str(ROOT / 'tw-post-extension/beta.onnx'), providers=['CPUExecutionProvider'])
assert patched.get_outputs()[0].shape == ['sequence_length', 1, 8210]
np.testing.assert_array_equal(output, patched.run(None, {'input1': tensor})[0])
config = json.loads((ROOT / 'tw-post-extension/model-config.json').read_text())
decoded = js({'data': output.reshape(-1).tolist(), 'dims': list(output.shape), 'digits': config['digits']})['text']
print(json.dumps({'sample': '4815', 'js_preprocessing_max_error': error, 'js_decoder_result': decoded}, indent=2))
assert error < 0.008, 'JS 與 Pillow 圖片处理差異過大'
assert decoded == '4815', '實際模型未辨識出人工標註答案'
wasm = js({'wasm': True, 'tensor': result['tensor'], 'dims': result['dims'], 'digits': config['digits']})
assert wasm['text'] == '4815', '瀏覽器 WASM 執行套件未辨識出人工標註答案'
assert wasm['shape'] == list(output.shape)
print('WASM runtime:', wasm)
# Adjacent equal digits collapse; blanks separate identical digits.
digits = config['digits']; classes = output.shape[-1]
sequence = ['4', '4', '', '8', '', '1', '', '1', '', '5']
logits = np.full((len(sequence), 1, classes), -10, dtype=np.float32)
for t, char in enumerate(sequence):
    index = next(item['index'] for item in digits if item['char'] == char)
    logits[t, 0, index] = 10
assert js({'data': logits.reshape(-1).tolist(), 'dims': list(logits.shape), 'digits': digits})['text'] == '48115'
print('PASS: native/WASM beta model, unchanged logits, corrected output metadata, JS preprocessing/CTC decoder/repeated digits')

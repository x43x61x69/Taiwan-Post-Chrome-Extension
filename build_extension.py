#!/usr/bin/env python3
"""Bundle locally installed model and npm runtime into an unpacked extension."""
import argparse
import importlib.metadata
import json
from pathlib import Path
import shutil
import sys
from model_metadata import repair_output_shape

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-only', action='store_true')
    args = parser.parse_args()
    import ddddocr
    if importlib.metadata.version('ddddocr') != '1.5.6':
        parser.error('請使用 requirements-ddddocr.txt 指定的 ddddocr 1.5.6。')
    destination = ROOT / 'tw-post-extension'
    engine = ddddocr.DdddOcr(show_ad=False, beta=True)
    chars = engine._DdddOcr__charset
    digits = [{'char': char, 'index': chars.index(char)} for char in [''] + list('0123456789')]
    source_model = (Path(ddddocr.__file__).parent / 'common.onnx').read_bytes()
    (destination / 'beta.onnx').write_bytes(repair_output_shape(source_model, len(chars)))
    (destination / 'model-config.json').write_text(json.dumps({'source': 'ddddocr 1.5.6 beta', 'digits': digits}, indent=2) + '\n')
    dist = importlib.metadata.distribution('ddddocr')
    license_path = next(Path(dist.locate_file(file)) for file in dist.files if str(file).endswith('.dist-info/LICENSE'))
    shutil.copyfile(license_path, destination / 'LICENSE-ddddocr.txt')
    print('beta 模型與數字字元表已匯出，輸出形狀標註已修正。')
    if args.model_only:
        return
    package = ROOT / 'extension-deps/node_modules/onnxruntime-web'
    if not package.is_dir():
        parser.error('缺少 ONNX Runtime Web；請執行 prepare-extension.command。')
    if json.loads((package / 'package.json').read_text())['version'] != '1.20.1':
        parser.error('ONNX Runtime Web 必須使用 1.20.1。')
    vendor = destination / 'vendor'
    vendor.mkdir(exist_ok=True)
    names = ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']
    for name in names:
        path = package / 'dist' / name
        if not path.is_file():
            parser.error(f'缺少 runtime 資源：{name}')
        shutil.copyfile(path, vendor / name)
    # The published 1.20.1 npm package does not include its upstream LICENSE.
    runtime_license = package / 'LICENSE'
    bundled_license = destination / 'LICENSE-onnxruntime.txt'
    if runtime_license.is_file():
        shutil.copyfile(runtime_license, bundled_license)
    elif not bundled_license.is_file():
        parser.error('缺少 LICENSE-onnxruntime.txt；請從原始專案還原授權檔案。')
    print(f'建置完成；Chrome「載入未封裝項目」請選擇：{destination}')


if __name__ == '__main__':
    try:
        main()
    except (ImportError, OSError, StopIteration) as error:
        sys.exit(f'建置失敗：{error}')

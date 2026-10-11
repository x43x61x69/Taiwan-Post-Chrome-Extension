# tw-post-extension — 中華郵政追蹤與離線 OCR（3.4.3）

此資料夾是可直接載入的 Chrome Manifest V3 擴充功能，需要 Chrome 116 以上。已包含離線 OCR 模型與 WASM，不需先安裝 Python 或執行建置。

1. 開啟 `chrome://extensions` 並啟用「開發人員模式」。
2. 點「載入未封裝項目」，選擇本資料夾。
3. 開啟或重新整理郵局查詢頁。

更新後，先在擴充功能管理頁點「重新載入」，再重新整理郵局頁面。

完整操作、自動查詢、限制與開發驗證請見[專案 README](../README.md)。保留本資料夾中的 `beta.onnx`、`model-config.json`、`vendor/`、四種尺寸圖示與所有程式檔案，避免擴充功能無法載入或辨識。

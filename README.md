# tw-post-extension — 中華郵政追蹤與離線 OCR

Chrome Manifest V3 擴充功能，目前版本 **3.4.3**，需要 **Chrome 116 以上**。支援中華郵政國內與國際郵件查詢、網址帶入追蹤碼，以及在擴充功能內執行的離線驗證碼 OCR。

## 安裝

專案已包含 ONNX 模型與 WASM 執行檔，可直接安裝，不需要先建置或安裝 Python。

1. 開啟 `chrome://extensions`，啟用「開發人員模式」。
2. 點「載入未封裝項目」，選擇本專案中的 `tw-post-extension` 資料夾。
3. 開啟或重新整理[國內查詢頁](https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100)或[國際查詢頁](https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500200)。

更新檔案後，在擴充功能管理頁點「重新載入」，再重新整理郵局頁面。模型與 WASM 均保存在擴充功能資料夾內，OCR 不需連線下載；郵件查詢仍需要連線至郵局。

## 使用方式

- 國際查詢支援單筆 13 碼英數字；國內查詢支援最多五筆，每筆為 14 或 20 碼數字。
- 網址的 `mailno` 或 `MAILNO` 會帶入追蹤碼欄位。國內多筆用逗號分隔，保留前導零與中間空白欄位；格式不符或超過五筆時不填入。
- 圖片載入後自動辨識四碼驗證碼。預設需手動點官方查詢按鈕，或在追蹤碼／驗證碼欄位按 Enter。
- 查詢時會同步網址的 `mailno` 與 `targetTxn`，保留其他參數及 hash。結果頁在非互動控制項上按 Enter，會觸發官方「回上一頁」。
- 「重新辨識」可重跑 OCR；手動修改過的驗證碼會保留，需先清空才能重新填入。「OCR 診斷」可查看辨識文字與耗時。
- OCR 失敗或官方回報驗證碼不正確時，會接續新圖或等待 0.5 秒後更新圖片。連續五次失敗即停止；手動輸入或離開查詢頁會取消等待中的更新，手動換圖／重新辨識可重新計數。

國際帶入範例（請換成自己的郵件號碼）：

```text
https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500200&mailno=EN544513815JP
```

國內多筆範例（第二欄留空）：

```text
https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100&mailno=12345678901234,,00000000000001
```

## 自動查詢

勾選 OCR 區塊的「自動查詢」會加入 `autosubmit=1` 並儲存偏好；取消勾選則移除參數並儲存關閉偏好。國內與國際共用設定。

只有網址具有 `autosubmit=1`、有效的 `mailno` 與目前欄位一致，且 OCR 成功填入四碼時，才會自動按官方查詢按鈕。手動輸入驗證碼或修改追蹤碼時不自動送出。勾選本身不立即提交。

開新頁時會套用已儲存偏好；明確指定 `autosubmit=0` 可暫停該次自動查詢，不會更改已儲存偏好。送出及顯示結果時保留參數，從結果／詳細頁按官方「回上一頁」才移除；返回當頁不會再次自動提交，重新整理或另開頁面才重新套用偏好。

官方明確回報驗證碼不正確時，自動模式可在五次失敗上限內重新辨識並提交；其他查詢錯誤不自動重送。這段重試中，OCR 失敗與官方拒絕共用計數，辨識出四碼不會清零；進入結果頁或手動換圖／重新辨識才清零。

## 資料與限制

OCR 使用 ddddocr 1.5.6 beta 模型與 ONNX Runtime Web 1.20.1，在擴充功能的 Worker 中執行。它讀取頁面已顯示的驗證碼圖片，由官方流程送出查詢。圖片與辨識結果不會送至外部 OCR 服務。

擴充功能只儲存自動查詢的布林偏好，不儲存郵件號碼或驗證碼。追蹤碼會留在網址中，也可能出現在瀏覽器歷史或分享的網址裡。

目前僅以一張人工標註圖片驗證 OCR，不能據此推論整體準確率。四碼結果可能有誤，請核對。自動重試與國內提交尚未完成官方網站端到端實測。

## 開發與重建

一般安裝不需執行這段。重建需要 Python 3.11、Node.js 與 npm，首次下載依賴需要網路。在專案根目錄執行：

```sh
./prepare-extension.command
```

腳本會建立 `.venv-ddddocr`、安裝固定版本的 ddddocr，依 npm lockfile 安裝 ONNX Runtime Web，再匯出模型與執行檔。若 Python 3.11 使用其他路徑：

```sh
PYTHON=/path/to/python3.11 ./prepare-extension.command
```

驗證：

```sh
node test_extension.cjs
.venv-ddddocr/bin/python verify_extension.py
```

第一項使用模擬 DOM 驗證追蹤碼、Enter、偏好、自動查詢、五次重試上限與手動輸入保護；第二項使用保留的 `4815` 樣本驗證 JS 前處理、CTC 解碼、Python／WASM 實際模型推論，以及輸出形狀修正不改變模型結果。測試通過不代表已在官方網站完成端到端查詢。

來源：[ddddocr](https://github.com/sml2h3/ddddocr)、[ONNX Runtime](https://github.com/microsoft/onnxruntime)。擴充功能資料夾內保留兩者的 MIT 授權；ONNX Runtime 授權取自[上游 v1.20.1](https://github.com/microsoft/onnxruntime/blob/v1.20.1/LICENSE)。

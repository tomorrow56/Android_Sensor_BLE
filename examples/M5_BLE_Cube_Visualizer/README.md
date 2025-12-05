# M5Stack BLE 3D Cube Visualizer

M5Stack用のBLEセンサーデータ受信スケッチです。Android端末からBLE経由で送信されるセンサーデータを受信し、3Dワイヤーフレームキューブで可視化します。

## 機能

- BLEデバイスのスキャンと選択（Service UUIDでフィルタリング）
- 分割送信されたJSONデータの再構築
- 加速度/重力センサーデータに基づく3Dキューブの回転表示
- スムーズなアニメーション（補間処理）
- 5Hz（200ms間隔）での画面更新

## 3D表示

加速度センサーまたは重力センサーのデータを使用して、ワイヤーフレームキューブをリアルタイムで回転表示します。

- **Pitch（X軸回転）**: 前後の傾き
- **Roll（Z軸回転）**: 左右の傾き
- **線の色**: 緑色

## 必要なライブラリ

- [M5Unified](https://github.com/m5stack/M5Unified)
- [NimBLE-Arduino](https://github.com/h2zero/NimBLE-Arduino) (v2.x)
- [ArduinoJson](https://github.com/bblanchon/ArduinoJson)

## 対応Androidアプリ

`app_for_m5` フォルダのAndroidアプリと組み合わせて使用してください。

- **APK**: `app_for_m5/app_for_m5-debug.apk`
- **アプリID**: `com.example.sensorbluetoothserial.m5`

## 使用方法

1. Arduino IDEでスケッチを開く
2. 必要なライブラリをインストール
3. M5Stackにアップロード
4. Androidアプリを起動してデータ送信を開始
5. M5Stackでデバイスをスキャン・選択・接続
6. 端末を傾けるとキューブが回転

## ボタン操作

| 状態 | BtnA | BtnB | BtnC |
|------|------|------|------|
| デバイス選択 | 上に移動 | 接続/再スキャン | 下に移動 |
| 接続中 | - | 切断 | - |
| エラー | - | 戻る | - |

## 技術仕様

### BLE設定

- **Service UUID**: `0000180A-0000-1000-8000-00805F9B34FB`
- **Characteristic UUID**: `00002A57-0000-1000-8000-00805F9B34FB`
- **MTU**: 517バイト（リクエスト）
- **スキャン時間**: 10秒
- **フィルタリング**: Service UUIDでアプリ動作中のデバイスのみ表示

### 3D描画

- **キューブサイズ**: 60x60x60ピクセル
- **投影**: 等角投影（Isometric）
- **更新レート**: 5Hz
- **補間**: 線形補間（smoothing factor: 0.3）

### データ受信

- 244バイト以下のチャンクで分割受信
- ブレースカウントによるJSON完了検出
- 文字列内のブレースを正しく処理
- タイムアウト: 300ms

### 使用センサー

| センサー | 用途 |
|---------|------|
| Accelerometer | キューブ回転（優先） |
| Gravity | キューブ回転（加速度がない場合） |
| Gyroscope | 将来の拡張用 |
| Magnetometer | 将来の拡張用 |

## トラブルシューティング

### デバイスが見つからない

- Androidアプリでデータ送信が開始されているか確認
- Bluetoothが有効になっているか確認
- 位置情報の権限が許可されているか確認
- アプリがService UUIDをアドバタイズしているか確認

### 接続できない

- 他のデバイスが接続していないか確認
- M5Stackを再起動して再試行
- Androidアプリを再起動

### キューブが動かない

- シリアルモニタでセンサーデータ受信を確認
- 加速度センサーまたは重力センサーが有効か確認
- 端末を大きく傾けてみる

## 関連スケッチ

- **M5_BLE_Rcv_Test_Complete**: センサーデータをテキストで表示するバージョン

## ライセンス

MIT License

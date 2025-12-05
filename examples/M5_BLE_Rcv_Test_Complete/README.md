# M5Stack BLE Sensor Receiver (Complete Version)

M5Stack用のBLEセンサーデータ受信スケッチです。Android端末からBLE経由で送信されるセンサーデータを受信・表示します。

## 機能

- BLEデバイスのスキャンと選択
- 分割送信されたJSONデータの再構築
- 完全なJSONパースによるセンサーデータ取得
- M5Stack画面へのリアルタイム表示

## 対応センサー

| センサー | 表示 | 説明 |
|---------|------|------|
| Accelerometer | Acc | 加速度 X,Y,Z (m/s²) |
| Gravity | Grv | 重力 X,Y,Z (m/s²) |
| Gyroscope | Gyr | ジャイロ X,Y,Z (rad/s) |
| Magnetometer | Mag | 磁気 X,Y,Z (μT) |
| Light | Light | 照度 (lux) |
| Proximity | Prox | 近接 (cm) |
| Pressure | Press | 気圧 (hPa) |
| Temperature | Temp | 温度 (°C) |
| Humidity | Hum | 湿度 (%) |
| GPS | Lat/Lon/Alt | 緯度、経度、高度、速度 |

## 必要なライブラリ

- [M5Unified](https://github.com/m5stack/M5Unified)
- [NimBLE-Arduino](https://github.com/h2zero/NimBLE-Arduino)
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

### データ受信
- 244バイト以下のチャンクで分割受信
- ブレースカウントによるJSON完了検出
- 文字列内のブレースを正しく処理
- タイムアウト: 300ms

### JSONフォーマット例
```json
{
  "timestamp": 1234567890,
  "accelerometer": {"x": 0.1, "y": 0.2, "z": 9.8},
  "gyroscope": {"x": 0.01, "y": 0.02, "z": 0.03},
  "gravity": {"x": 0.0, "y": 0.0, "z": 9.8},
  "magnetometer": {"x": 10.5, "y": 20.3, "z": -5.2},
  "light": {"lux": 500.0},
  "proximity": {"distance": 5.0},
  "gps": {
    "latitude": 35.681236,
    "longitude": 139.767125,
    "altitude": 40.0,
    "speed": 0.0,
    "accuracy": 10.0
  }
}
```

## トラブルシューティング

### デバイスが見つからない
- Androidアプリでデータ送信が開始されているか確認
- Bluetoothが有効になっているか確認
- 位置情報の権限が許可されているか確認

### 接続できない
- 他のデバイスが接続していないか確認
- M5Stackを再起動して再試行

### データが表示されない
- シリアルモニタでログを確認
- 「Sensor data updated (complete JSON)」が表示されているか確認

## ライセンス

MIT License

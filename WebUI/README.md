# Android Sensor Data Web Bluetooth Receiver

Web Bluetooth APIを使用してAndroidアプリのセンサーデータを受信するWebアプリケーションです。

## 概要

このアプリケーションは、AndroidスマートフォンがBluetooth Low Energy (BLE) 経由で送信するセンサーデータをWebブラウザで直接受信・表示します。

### 主な機能

- **Bluetooth接続**: Web Bluetooth APIでAndroidデバイスに接続
- **リアルタイムデータ表示**: 加速度、ジャイロ、光センサー、GPSデータをリアルタイム表示
- **データ記録**: 受信したセンサーデータを保存
- **CSVエクスポート**: 記録したデータをCSV形式でダウンロード
- **接続統計**: 接続時間、受信データ数などの統計情報を表示
- **詳細ログ**: 接続、データ受信、エラーなどの詳細なログを表示

## 必要な環境

### ブラウザ要件

Web Bluetooth APIは以下のブラウザでサポートされています：

- **Chrome** (推奨)
- **Edge** (Chromiumベース)
- **Opera** (Chromiumベース)
- **Safari** (iOS 14.5+、macOS Big Sur+)

**注**: FirefoxはWeb Bluetooth APIをサポートしていません。

### Androidアプリ要件

- BLE Peripheral機能を実装したAndroidセンサーアプリ
- GitHubリポジトリ: https://github.com/tomorrow56/Android_Sensor_BLE/
- サービスUUID: `0000180a-0000-1000-8000-00805f9b34fb`
- キャラクタリスティックUUID: `00002a57-0000-1000-8000-00805f9b34fb`
- JSON形式でセンサーデータを送信

## 使用方法

### 1. アプリケーションの起動

1. プロジェクトフォルダをWebサーバーでホストします
   ```bash
   # Python 3の場合
   python -m http.server 8000
   
   # Node.jsの場合
   npx http-server
   ```

2. ブラウザで `http://localhost:8000` にアクセスします

### 2. Bluetoothデバイスへの接続

1. **「🔗 Bluetoothデバイスに接続」**ボタンをクリック
2. ブラウザのBluetoothデバイス選択ダイアログでAndroidデバイスを選択
3. ペアリングを完了（必要な場合）
4. 接続が完了するとステータスが「✅ 接続済み」に変わります

### 3. データ受信の開始

1. 接続完了後、**「▶️ データ受信開始」**ボタンをクリック
2. Androidアプリでセンサーデータの送信を開始
3. リアルタイムでセンサーデータが表示されます

### 4. データのエクスポート

1. データ受信中または停止後に**「💾 CSVでエクスポート」**ボタンをクリック
2. CSVファイルが自動的にダウンロードされます
3. ファイル名: `sensor_data_YYYY-MM-DDTHH-MM-SS.csv`

## データ形式

### 受信するJSONデータ

```json
{
  "timestamp": 1678886400000,
  "accelerometer": {
    "x": 0.1,
    "y": 0.2,
    "z": 9.8
  },
  "gyroscope": {
    "x": 0.01,
    "y": -0.02,
    "z": 0.0
  },
  "light": {
    "lux": 150.0
  },
  "gps": {
    "latitude": 35.6895,
    "longitude": 139.6917,
    "altitude": 50.0,
    "accuracy": 10.0,
    "speed": 0.5
  }
}
```

### CSVエクスポート形式

```csv
Timestamp,Accel X,Accel Y,Accel Z,Gyro X,Gyro Y,Gyro Z,Light,GPS Lat,GPS Lng,GPS Alt,GPS Acc
1678886400000,0.1,0.2,9.8,0.01,-0.02,0.0,150.0,35.6895,139.6917,50.0,10.0
```

## 画面の説明

### 制御パネル

- **接続ステータス**: 現在のBluetooth接続状態を表示
- **接続/切断ボタン**: Bluetoothデバイスの接続・切断
- **受信開始/停止ボタン**: センサーデータ受信の開始・停止
- **CSVエクスポート**: データのCSVファイルダウンロード
- **データクリア**: 記録したデータのクリア

### センサーデータ表示

- **📱 加速度センサー**: X/Y/Z軸の加速度 (m/s²)
- **🔄 ジャイロスコープ**: X/Y/Z軸の角速度 (rad/s)
- **💡 光センサー**: 照度 (lux)
- **📍 GPS**: 緯度/経度/高度/精度

### 統計情報

- **受信データ数**: 累計受信データ数
- **接続時間**: 現在の接続時間
- **最終更新**: 最後にデータを受信した時刻

### ログ

- 接続、データ受信、エラーなどの詳細なログ
- タイムスタンプ付きで最大100件のログを保持

## トラブルシューティング

### 接続できない場合

1. **ブラウザの確認**: Web Bluetooth APIをサポートしたブラウザを使用しているか確認
2. **Bluetoothの有効化**: デバイスのBluetoothが有効になっているか確認
3. **Androidアプリの確認**: BLEアドバタイズが有効になっているか確認
4. **HTTPSの確認**: Web Bluetooth APIはHTTPS環境またはlocalhostでのみ動作

### データが受信できない場合

1. **Androidアプリの確認**: センサーデータの送信が開始されているか確認
2. **UUIDの確認**: サービスUUIDとキャラクタリスティックUUIDが一致しているか確認
3. **Notificationの確認**: AndroidアプリがBLE Notificationを送信しているか確認

### エラーメッセージ

- **「このブラウザはWeb Bluetooth APIをサポートしていません」**: 対応ブラウザを使用してください
- **「接続エラー: Bluetooth Device is not available」**: Bluetoothが有効になっているか確認してください
- **「キャラクタリスティックが利用できません」**: UUIDが一致しているか確認してください

## セキュリティについて

- Web Bluetooth APIはユーザーの明示的な許可なしにデバイスにアクセスできません
- 接続は現在のセッションのみ有効で、ページを更新すると再接続が必要です
- 通信は暗号化されています

## 技術仕様

- **Web Bluetooth API**: W3C標準
- **BLEプロファイル**: Custom Service
- **データ形式**: JSON (UTF-8)
- **対応プロトコル**: Bluetooth Low Energy (BLE)
- **最小要件**: HTTPS環境またはlocalhost

## ライセンス

MIT License

## 作者

Manus AI
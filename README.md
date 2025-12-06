# Android Sensor BLE Serial

Androidスマートフォンの内部センサーの値を **Bluetooth Low Energy (BLE)** でPCへ出力するアプリケーションです。

## 概要

このアプリケーションは、Androidデバイスに搭載されている以下のセンサーデータを収集し、 **BLEのNotification** 機能を使用してJSON形式でPCへリアルタイムに送信します。

- **加速度センサー** (m/s²) - X, Y, Z軸
- **ジャイロスコープ** (rad/s) - X, Y, Z軸
- **光センサー** (lux)
- **GPS** (位置情報)
- **磁気センサー** (μT) - X, Y, Z軸
- **近接センサー** (cm)
- **重力センサー** (m/s²) - X, Y, Z軸

データはBLE経由でリアルタイムにPCへ送信され、付属のPythonスクリプトを使用してCSVファイルに保存することができます。

## 主な機能

- **リアルタイムデータ表示**: アプリ画面上でセンサーの現在値を確認できます
- **柔軟なサンプリングレート**: 1Hz〜100Hzの範囲で7段階のサンプリングレートを選択可能
- **バックグラウンド動作**: フォアグラウンドサービスとして動作し、安定したデータ収集が可能
- **BLEペリフェラル**: GATTサービスを公開し、PC（セントラル）へのデータ送信を可能にします
- **JSON形式出力**: 標準的なJSON形式でデータを出力するため、様々な用途に活用可能

## 技術仕様

- **通信方式**: Bluetooth Low Energy (BLE)
- **GATTサービスUUID**: `0000180A-0000-1000-8000-00805F9B34FB` (Device Information Service - 例として使用)
- **キャラクタリスティックUUID**: `00002A57-0000-1000-8000-00805F9B34FB` (Sensor Location Characteristic - 例として使用)
- **開発言語**: Kotlin
- **最小SDKバージョン**: Android 8.0 (API Level 26)
- **ターゲットSDKバージョン**: Android 14 (API Level 34)

## インストール方法

### 必要な環境

- Android 8.0 (API Level 26) 以上
- Bluetooth Low Energy (BLE)に対応したPC (macOSを推奨)
- Android Debug Bridge (ADB)がインストールされたPC (APKインストール用)
- USBデバッグが有効になったAndroidデバイス

### インストール手順

1.  このプロジェクトをAndroid Studioでビルドし、APKファイルを生成します。
2.  Androidデバイスで「開発者向けオプション」と「USBデバッグ」を有効にします。
3.  デバイスをPCにUSBケーブルで接続します。
4.  以下のコマンドでAPKをインストールします:

    ```bash
    adb install -r app-release.apk # ビルドしたAPKファイル名に置き換えてください
    ```

## 使用方法

### アプリの操作

1.  アプリを起動し、位置情報およびBluetooth関連の権限を許可します。
2.  サンプリングレート（1Hz〜100Hz）を選択します。
3.  「開始」ボタンをタップしてデータ収集とBLEアドバタイズを開始します。
4.  画面上でセンサーの現在値がリアルタイムで更新されます。
5.  「停止」ボタンでデータ収集とBLEアドバタイズを停止します。

### PC側でのデータ受信 (macOS推奨)

付属の`receive_ble_sensor_data.py`スクリプトを使用して、PC側でデータを受信・保存できます。

1.  Python環境に`bleak`ライブラリをインストールします。

    ```bash
    pip install bleak
    ```

2.  スクリプトを実行します。

    ```bash
    # 通常版（appフォルダのAndroidアプリ用）
    python3 receive_ble_sensor_data.py

    # M5Stack対応版（app_for_m5のAndroidアプリ用）
    python3 receive_ble_sensor_data_m5.py
    ```

スクリプトは以下の処理を行います:
- BLEデバイスのスキャンと接続
- センサーデータ (JSON) のリアルタイム受信
- コンソールへのリアルタイム表示
- CSVファイルへの自動保存

**注意**: `receive_ble_sensor_data_m5.py`は分割送信されたデータの再構築に対応しています。

## データフォーマット

出力されるJSONデータの形式はUSB版と同じです。

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
  },
  "magnetometer": {
    "x": 12.34,
    "y": -23.45,
    "z": 45.67
  },
  "proximity": {
    "distance": 5.0
  },
  "gravity": {
    "x": 0.12,
    "y": 0.34,
    "z": 9.78
  }
}
```

### センサー詳細

| センサー | 測定内容 | 単位 | 出力形式 |
|---------|---------|------|----------|
| 加速度センサー | 加速度 | m/s² | X, Y, Z軸 |
| ジャイロスコープ | 角速度 | rad/s | X, Y, Z軸 |
| 光センサー | 照度 | lux | 単一値 |
| GPS | 位置情報 | 度/m/m/s | 緯度、経度、高度、精度、速度 |
| 磁気センサー | 磁場強度 | μT | X, Y, Z軸 |
| 近接センサー | 距離 | cm | 単一値 |
| 重力センサー | 重力加速度 | m/s² | X, Y, Z軸 |

## Web可視化デモ

このプロジェクトには、2種類のWeb可視化デモが含まれています。

### WebUI - データ表示とCSVエクスポート

センサーデータをリアルタイムで表示し、CSVファイルとしてエクスポートできるシンプルなWebアプリケーションです。

- **場所**: `WebUI/`
- **機能**: データ表示、CSVエクスポート、接続統計
- **詳細**: [WebUI/README.md](WebUI/README.md)

### WebUI_Cube - 3D可視化デモ

IMUセンサーデータを3Dキューブで可視化するインタラクティブなWebアプリケーションです。

- **デプロイURL**: https://android-sensor-ble.vercel.app/
- **場所**: `WebUI_Cube/`
- **機能**: 3Dキューブのリアルタイム姿勢表示、インタラクティブな視点操作
- **技術**: Three.js、Web Bluetooth API
- **詳細**: [WebUI_Cube/README.md](WebUI_Cube/README.md)

両方のデモアプリケーションは、Web Bluetooth APIを使用してブラウザから直接Androidデバイスに接続できます。Chrome、Edge、Operaなどのブラウザでご利用いただけます。

## M5Stack対応

このプロジェクトには、M5Stackでセンサーデータを受信するためのサンプルスケッチと専用Androidアプリが含まれています。

### app_for_m5 - M5Stack対応 Androidアプリ

M5Stackとの通信に最適化されたAndroidセンサーデータ送信アプリです。

- **場所**: `app_for_m5/`
- **APK**: `app_for_m5/app_for_m5-debug.apk`
- **特徴**: MTU対応のデータ分割送信、終端マーカー対応
- **詳細**: [app_for_m5/README.md](app_for_m5/README.md)

### M5_BLE_Rcv_Test_Complete - テキスト表示版

センサーデータをテキストで表示するM5Stack用スケッチです。

- **場所**: `examples/M5_BLE_Rcv_Test_Complete/`
- **機能**: BLEデバイススキャン、デバイス選択、JSONデータ受信・表示
- **必要ライブラリ**: M5Unified, NimBLE-Arduino, ArduinoJson

### M5_BLE_Cube_Visualizer - 3Dキューブ可視化版

センサーデータを3Dワイヤーフレームキューブで可視化するM5Stack用スケッチです。

- **場所**: `examples/M5_BLE_Cube_Visualizer/`
- **機能**: 3Dキューブのリアルタイム姿勢表示、スムーズなアニメーション
- **必要ライブラリ**: M5Unified, NimBLE-Arduino, ArduinoJson
- **詳細**: [examples/M5_BLE_Cube_Visualizer/README.md](examples/M5_BLE_Cube_Visualizer/README.md)

## プロジェクト構造

```
Android_Sensor_BLE/
├── app/                                        # 通常版Androidアプリ
│   ├── src/
│   │   └── main/
│   │       ├── java/com/example/sensorbluetoothserial/
│   │       │   ├── MainActivity.kt           # メインアクティビティ
│   │       │   ├── BlePeripheralService.kt   # BLEペリフェラルサービス
│   │       │   ├── SensorDataManager.kt      # センサー管理
│   │       │   └── SensorData.kt             # データモデル
│   │       ├── res/
│   │       └── AndroidManifest.xml
│   └── build.gradle
├── app_for_m5/                                 # M5Stack対応版Androidアプリ
│   ├── src/
│   ├── app_for_m5-debug.apk
│   └── README.md
├── examples/                                   # M5Stack用サンプルスケッチ
│   ├── M5_BLE_Rcv_Test_Complete/               # テキスト表示版
│   │   └── M5_BLE_Rcv_Test_Complete.ino
│   └── M5_BLE_Cube_Visualizer/                 # 3Dキューブ可視化版
│       ├── M5_BLE_Cube_Visualizer.ino
│       └── README.md
├── WebUI/                                      # Webデータ表示デモ
│   ├── index.html
│   ├── app.js
│   └── README.md
├── WebUI_Cube/                                 # Web 3D可視化デモ
│   ├── index.html
│   ├── app.js
│   └── README.md
├── receive_ble_sensor_data.py                  # PC側BLEデータ受信スクリプト
├── receive_ble_sensor_data_m5.py               # PC側BLEデータ受信スクリプト (M5対応版)
└── README.md
```

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 作者

Manus AI (Based on tomorrow56/Android_Sensor_USB_Serial)

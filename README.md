# Android Sensor USB Serial

Androidスマートフォンの内部センサーの値をUSBシリアルでPCへ出力するアプリケーションです。

## 概要

このアプリケーションは、Androidデバイスに搭載されている以下のセンサーデータを収集し、JSON形式で出力します。

- **加速度センサー** (m/s²)
- **ジャイロスコープ** (rad/s)
- **GPS** (位置情報)
- **光センサー** (lux)

データは`adb logcat`経由でリアルタイムにPCへ送信され、付属のPythonスクリプトを使用してCSVファイルに保存することができます。

## 主な機能

- **リアルタイムデータ表示**: アプリ画面上でセンサーの現在値を確認できます
- **柔軟なサンプリングレート**: 1Hz〜100Hzの範囲で7段階のサンプリングレートを選択可能
- **バックグラウンド動作**: フォアグラウンドサービスとして動作し、安定したデータ収集が可能
- **JSON形式出力**: 標準的なJSON形式でデータを出力するため、様々な用途に活用可能

## インストール方法

### 必要な環境

- Android 7.0 (API Level 24) 以上
- Android Debug Bridge (ADB)がインストールされたPC
- USBデバッグが有効になったAndroidデバイス

### インストール手順

1. [Releases](https://github.com/tomorrow56/Android_Sensor_USB_Serial/releases)から最新のAPKファイルをダウンロードします
2. Androidデバイスで「開発者向けオプション」と「USBデバッグ」を有効にします
3. デバイスをPCにUSBケーブルで接続します
4. 以下のコマンドでAPKをインストールします:

```bash
adb install -r SensorUSBSerial_v2.apk
```

## 使用方法

### アプリの操作

1. アプリを起動し、位置情報の権限を許可します
2. サンプリングレート（1Hz〜100Hz）を選択します
3. 「開始」ボタンをタップしてデータ収集を開始します
4. 画面上でセンサーの現在値がリアルタイムで更新されます
5. 「停止」ボタンでデータ収集を停止します

### PC側でのデータ受信

付属の`receive_sensor_data.py`スクリプトを使用して、PC側でデータを受信・保存できます。

```bash
python3 receive_sensor_data.py
```

スクリプトは以下の処理を行います:
- ADB接続の確認
- `adb logcat`からのデータ受信
- コンソールへのリアルタイム表示
- CSVファイルへの自動保存

## データフォーマット

出力されるJSONデータの形式:

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

## プロジェクト構造

```
SensorUSBSerial/
├── app/
│   ├── src/
│   │   └── main/
│   │       ├── java/com/example/sensorusbserial/
│   │       │   ├── MainActivity.kt           # メインアクティビティ
│   │       │   ├── UsbSerialService.kt       # データ収集サービス
│   │       │   ├── SensorDataManager.kt      # センサー管理
│   │       │   └── SensorData.kt             # データモデル
│   │       ├── res/
│   │       │   └── layout/
│   │       │       └── activity_main.xml     # UIレイアウト
│   │       └── AndroidManifest.xml
│   └── build.gradle
├── receive_sensor_data.py                     # PC側データ受信スクリプト
├── release/
│   └── SensorUSBSerial_v2.apk                # 配布用APK
└── README.md
```

## 技術仕様

- **開発言語**: Kotlin
- **最小SDKバージョン**: Android 7.0 (API Level 24)
- **ターゲットSDKバージョン**: Android 14 (API Level 34)
- **主要ライブラリ**:
  - AndroidX Core KTX
  - Google Play Services Location
  - Gson (JSON処理)

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 作者

Manus AI

## 更新履歴

### v2 (2025-11-05)
- 画面上にセンサーデータのリアルタイム表示機能を追加
- サンプリングレートに1Hz、2Hz、5Hzを追加

### v1.1 (2025-11-04)
- Android 11でのクラッシュ問題を修正
- フォアグラウンドサービスの安定性を向上
- Pythonスクリプトを追加

### v1.0 (2025-11-03)
- 初回リリース

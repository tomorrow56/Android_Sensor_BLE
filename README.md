# Android Sensor BLE Serial

Androidスマートフォンの内部センサーの値を **Bluetooth Low Energy (BLE)** でPCへ出力するアプリケーションです。

## 概要

このアプリケーションは、Androidデバイスに搭載されている以下のセンサーデータを収集し、 **BLEのNotification** 機能を使用してJSON形式でPCへリアルタイムに送信します。

- **加速度センサー** (m/s²)
- **ジャイロスコープ** (rad/s)
- **GPS** (位置情報)
- **光センサー** (lux)

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
    python3 receive_ble_sensor_data.py
    ```

スクリプトは以下の処理を行います:
- BLEデバイスのスキャンと接続
- センサーデータ (JSON) のリアルタイム受信
- コンソールへのリアルタイム表示
- CSVファイルへの自動保存

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
  }
}
```

## Web可視化デモ

このプロジェクトには、2種類のWeb可視化デモが含まれています。

### WebUI - データ表示とCSVエクスポート

センサーデータをリアルタイムで表示し、CSVファイルとしてエクスポートできるシンプルなWebアプリケーションです。

- **場所**: `WebUI/`
- **機能**: データ表示、CSVエクスポート、接続統計
- **詳細**: [WebUI/README.md](WebUI/README.md)

### WebUI_Cube - 3D可視化デモ

IMUセンサーデータを3Dキューブで可視化するインタラクティブなWebアプリケーションです。

- **場所**: `WebUI_Cube/`
- **機能**: 3Dキューブのリアルタイム姿勢表示、インタラクティブな視点操作
- **技術**: Three.js、Web Bluetooth API
- **詳細**: [WebUI_Cube/README.md](WebUI_Cube/README.md)

両方のデモアプリケーションは、Web Bluetooth APIを使用してブラウザから直接Androidデバイスに接続できます。Chrome、Edge、Operaなどのブラウザでご利用いただけます。

## プロジェクト構造

```
Android_Sensor_BLE_Serial/
├── app/
│   ├── src/
│   │   └── main/
│   │       ├── java/com/example/sensorbluetoothserial/
│   │       │   ├── MainActivity.kt           # メインアクティビティ
│   │       │   ├── BlePeripheralService.kt     # BLEペリフェラルサービス (データ収集・BLE送信)
│   │       │   ├── SensorDataManager.kt      # センサー管理
│   │       │   └── SensorData.kt             # データモデル
│   │       ├── res/
│   │       └── AndroidManifest.xml
│   └── build.gradle
├── WebUI/                                      # Webデータ表示デモ
│   ├── index.html
│   ├── app.js
│   └── README.md
├── WebUI_Cube/                                 # Web 3D可視化デモ
│   ├── index.html
│   ├── app.js
│   └── README.md
├── receive_ble_sensor_data.py                 # PC側BLEデータ受信スクリプト
└── README.md
```

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 作者

Manus AI (Based on tomorrow56/Android_Sensor_USB_Serial)

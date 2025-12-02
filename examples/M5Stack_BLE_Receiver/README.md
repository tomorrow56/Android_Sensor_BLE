# M5Stack BLE Sensor Receiver (デバイス選択メニュー付き)

## 概要

このArduinoスケッチは、[Android_Sensor_BLE](https://github.com/tomorrow56/Android_Sensor_BLE/)アプリから送信されるセンサーデータをBLE経由で受信し、M5Stackの画面に表示します。

**新機能**: BLEデバイスをスキャンして一覧表示し、接続先を選択できるメニュー画面を搭載しています。

## 対応デバイス

- M5Stack Basic
- M5Stack Core2
- M5Stack CoreS3
- その他M5Unifiedに対応したM5Stackデバイス

## 必要なライブラリ

以下のライブラリをArduino IDEのライブラリマネージャーからインストールしてください。

1. **M5Unified** (by M5Stack)
   - M5Stackの統合ライブラリ
   - インストール: Arduino IDE → ツール → ライブラリを管理 → "M5Unified" で検索

2. **ArduinoJson** (by Benoit Blanchon)
   - JSON解析ライブラリ
   - インストール: Arduino IDE → ツール → ライブラリを管理 → "ArduinoJson" で検索
   - バージョン6.x以上を推奨

## 主な機能

### デバイス選択メニュー

- **自動スキャン**: 起動時に自動的にBLEデバイスをスキャン
- **デバイス一覧表示**: 検出されたAndroid Sensor BLEデバイスを一覧表示
- **RSSI表示**: 各デバイスの電波強度(dBm)を表示
- **スクロール対応**: 8台以上のデバイスが見つかった場合もスクロールで全て表示
- **ボタン操作**: 
  - **BtnA (左ボタン)**: リスト内を上に移動
  - **BtnB (中央ボタン)**: デバイスを選択して接続 / デバイスがない場合は再スキャン
  - **BtnC (右ボタン)**: リスト内を下に移動

### 接続中の操作

- **BtnA (左ボタン)**: 切断して再スキャン
- **BtnB (中央ボタン)**: 現在の接続を切断してデバイスリストに戻る

### 受信可能なセンサーデータ

- **加速度センサー** (m/s²) - X, Y, Z軸
- **ジャイロスコープ** (rad/s) - X, Y, Z軸
- **磁気センサー** (μT) - X, Y, Z軸
- **重力センサー** (m/s²) - X, Y, Z軸
- **光センサー** (lux)
- **近接センサー** (cm)
- **GPS** (緯度、経度、高度、速度)

### 画面表示

- **スキャン画面**: スキャン中の進捗と検出デバイス数
- **デバイスリスト画面**: 検出されたデバイスの一覧(名前、RSSI)
- **接続中画面**: 接続処理の進捗
- **センサーデータ画面**: 受信したセンサーデータのリアルタイム表示
- カラフルな色分け表示(センサー名:シアン、データ:白、エラー:赤、ボタンガイド:緑)

## 使用方法

### 1. スケッチの書き込み

1. Arduino IDEでスケッチ(`M5Stack_BLE_Sensor_Receiver.ino`)を開きます
2. ボードを選択: ツール → ボード → M5Stack Arduino → M5Stack-Core-ESP32
   - Core2の場合: M5Stack-Core2
   - CoreS3の場合: M5Stack-CoreS3
3. シリアルポートを選択
4. 書き込みボタンをクリック

### 2. Androidアプリの準備

1. Android端末に[Android_Sensor_BLE](https://github.com/tomorrow56/Android_Sensor_BLE/)アプリをインストール
2. アプリを起動し、必要な権限を許可
3. サンプリングレートを選択(推奨: 10Hz)
4. 「開始」ボタンをタップしてBLEアドバタイズを開始

### 3. デバイスの選択と接続

1. M5Stackの電源を入れる
2. 自動的にBLEデバイスのスキャンが開始されます(約5秒間)
3. スキャン完了後、検出されたデバイスの一覧が表示されます
4. **BtnA/BtnC**で接続したいデバイスを選択
5. **BtnB**を押して接続
6. 接続成功後、センサーデータが画面に表示されます

### 4. 切断と再接続

- **接続中にBtnBを押す**: 現在の接続を切断してデバイスリストに戻る
- **接続中にBtnAを押す**: 切断して新しいスキャンを開始
- **デバイスリスト画面でBtnBを押す**: 選択したデバイスに接続

## 画面遷移

```
起動
 ↓
スキャン画面 (約5秒)
 ↓
デバイスリスト画面
 ├→ [BtnB] → 接続中画面 → センサーデータ画面
 │                           ├→ [BtnA] → スキャン画面
 │                           └→ [BtnB] → デバイスリスト画面
 └→ [BtnB(デバイスなし)] → スキャン画面
```

## トラブルシューティング

### デバイスが見つからない場合

- Android端末のBluetoothが有効になっているか確認
- Androidアプリで「開始」ボタンを押してBLEアドバタイズが開始されているか確認
- デバイスリスト画面で**BtnB**を押して再スキャン
- Android端末とM5Stackの距離を近づける

### 接続できない場合

- デバイスリストで正しいデバイスを選択しているか確認
- Android端末を再起動
- M5Stackを再起動

### データが表示されない場合

- シリアルモニタ(115200bps)を開いてエラーメッセージを確認
- JSONパースエラーが出る場合は、ArduinoJsonライブラリのバージョンを確認
- "No data received"と表示される場合は、Androidアプリでセンサーデータの送信が開始されているか確認
- **BtnA**を押して再スキャン・再接続を試す

### メモリ不足エラー

- JSON解析用のバッファサイズ(`StaticJsonDocument<2048>`)を調整
- 表示するセンサーの種類を減らす
- デバイスリストの最大表示数(`MAX_DISPLAY_DEVICES`)を減らす

## BLE通信仕様

### サービスUUID
```
0000180A-0000-1000-8000-00805F9B34FB
```

### キャラクタリスティックUUID
```
00002A57-0000-1000-8000-00805F9B34FB
```

### データフォーマット

JSON形式の文字列がBLE Notificationで送信されます。

```json
{
  "timestamp": 1678886400000,
  "accelerometer": {"x": 0.1, "y": 0.2, "z": 9.8},
  "gyroscope": {"x": 0.01, "y": -0.02, "z": 0.0},
  "light": {"lux": 150.0},
  "gps": {
    "latitude": 35.6895,
    "longitude": 139.6917,
    "altitude": 50.0,
    "accuracy": 10.0,
    "speed": 0.5
  },
  "magnetometer": {"x": 12.34, "y": -23.45, "z": 45.67},
  "proximity": {"distance": 5.0},
  "gravity": {"x": 0.12, "y": 0.34, "z": 9.78}
}
```

## カスタマイズ

### デバイスリストの表示数を変更

```cpp
const int MAX_DISPLAY_DEVICES = 8;  // 一度に表示するデバイス数
```

### スキャン時間を変更

```cpp
pBLEScan->start(5, false);  // 5秒間スキャン → 任意の秒数に変更可能
```

### 表示するセンサーの変更

`displaySensorData()`関数内で、不要なセンサーの表示部分をコメントアウトすることで、表示するセンサーを選択できます。

### 画面レイアウトの変更

- `M5.Display.setTextSize()`: 文字サイズの変更
- `M5.Display.setTextColor()`: 文字色の変更
- `M5.Display.setCursor(x, y)`: 表示位置の変更

### スキャン間隔の調整

```cpp
pBLEScan->setInterval(1349);  // スキャン間隔(ms)
pBLEScan->setWindow(449);     // スキャンウィンドウ(ms)
```

## ボタン操作まとめ

### デバイスリスト画面
| ボタン | 機能 |
|--------|------|
| BtnA (左) | リスト内を上に移動 |
| BtnB (中央) | デバイスを選択して接続 / 再スキャン(デバイスなし時) |
| BtnC (右) | リスト内を下に移動 |

### センサーデータ画面(接続中)
| ボタン | 機能 |
|--------|------|
| BtnA (左) | 切断して再スキャン |
| BtnB (中央) | 切断してデバイスリストに戻る |
| BtnC (右) | (未使用) |

## 技術詳細

### 状態管理

アプリケーションは以下の4つの状態を持ちます:

- `STATE_SCANNING`: BLEデバイスをスキャン中
- `STATE_DEVICE_LIST`: デバイスリストを表示中
- `STATE_CONNECTING`: デバイスに接続中
- `STATE_CONNECTED`: デバイスに接続済み、データ受信中

### デバイスリスト管理

- `std::vector<BLEDeviceInfo>`を使用して動的にデバイス情報を管理
- 重複デバイスは自動的にRSSI値を更新
- 目的のサービスUUIDを持つデバイスのみをリストに追加

### スクロール機能

- 8台以上のデバイスが検出された場合、自動的にスクロール
- 選択位置に応じて表示範囲を自動調整
- 画面下部に現在の選択位置を表示

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 参考リンク

- [Android_Sensor_BLE GitHub Repository](https://github.com/tomorrow56/Android_Sensor_BLE/)
- [M5Unified Documentation](https://github.com/m5stack/M5Unified)
- [ArduinoJson Documentation](https://arduinojson.org/)
- [ESP32 BLE Arduino Documentation](https://github.com/nkolban/ESP32_BLE_Arduino)

/*
 * M5Stack BLE Sensor Receiver (NimBLE Version)
 * AndroidアプリからセンサーデータをBLEで受信して表示
 * 
 * 機能:
 * - BLEデバイススキャン
 * - デバイス選択と接続
 * - サービス探索とキャラクタリスティック登録
 * - JSONセンサーデータの受信と表示
 * 
 * 使用ライブラリ:
 * - M5Unified (M5Stack表示)
 * - NimBLE-Arduino (Bluetooth Low Energy - Android互換性向上)
 * - ArduinoJson (JSONパース)
 */

#include <M5Unified.h>
#include <NimBLEDevice.h>
#include <NimBLEAdvertisedDevice.h>
#include <NimBLEScan.h>
#include <ArduinoJson.h>
#include <vector>

// BLE UUIDs (Androidアプリと合わせる)
static NimBLEUUID serviceUUID("0000180A-0000-1000-8000-00805F9B34FB");
static NimBLEUUID charUUID("00002A57-0000-1000-8000-00805F9B34FB");

// アプリケーション状態
enum AppState {
  STATE_SCANNING,
  STATE_DEVICE_LIST,
  STATE_CONNECTING,
  STATE_CONNECTED,
  STATE_ERROR
};

AppState currentState = STATE_SCANNING;

// BLE関連の変数
NimBLEClient* pClient = nullptr;
NimBLERemoteCharacteristic* pRemoteCharacteristic = nullptr;
bool connected = false;

// デバイスリスト
struct DeviceInfo {
  String name;
  String address;
  int rssi;
  uint8_t addressType;  // アドレスタイプを保存
};
std::vector<DeviceInfo> deviceList;
int selectedDevice = 0;

// センサーデータ構造体
struct SensorData {
  unsigned long timestamp;
  float accelX, accelY, accelZ;
  float gyroX, gyroY, gyroZ;
  float magX, magY, magZ;
  float gravX, gravY, gravZ;  // 重力センサー
  float light;
  float pressure;
  float temperature;
  float humidity;
  float proximity;
  // GPS
  double latitude, longitude;
  float altitude;
  float speed;
  float accuracy;
  bool hasAccel, hasGyro, hasMag, hasGrav, hasLight, hasPressure, hasTemp, hasHumidity, hasProximity, hasGps;
};

SensorData sensorData;
String lastError = "";
unsigned long lastDataReceived = 0;

// BLE接続コールバッククラス
class MyClientCallback : public NimBLEClientCallbacks {
  void onConnect(NimBLEClient* pclient) {
    Serial.println("Connected to BLE device");
    connected = true;
  }

  void onDisconnect(NimBLEClient* pclient) {
    connected = false;
    Serial.println("Disconnected from BLE device");
    lastError = "Disconnected";
    currentState = STATE_DEVICE_LIST;
  }
};

// JSONデータ蓄積バッファ
String jsonBuffer = "";
unsigned long lastNotifyTime = 0;
int braceCount = 0;
bool inString = false;  // 文字列内かどうか

// 通知受信コールバック
static void notifyCallback(
  NimBLERemoteCharacteristic* pBLERemoteCharacteristic,
  uint8_t* pData,
  size_t length,
  bool isNotify) {
  
  // null文字でパディングされているので、実際のデータ長を見つける
  size_t actualLen = length;
  for (size_t i = 0; i < length; i++) {
    if (pData[i] == 0) {
      actualLen = i;
      break;
    }
  }
  
  if (actualLen == 0) return;
  
  // デバッグ: 受信データの最初と最後を表示
  Serial.print("Received ");
  Serial.print(actualLen);
  Serial.print(" bytes, buffer:");
  Serial.println(jsonBuffer.length());
  
  // 新しいJSONの開始を検出（前回から時間が経過している場合）
  unsigned long now = millis();
  if (now - lastNotifyTime > 300 && jsonBuffer.length() > 0) {
    // 前のデータが不完全なまま新しいデータが来た
    Serial.println("Timeout, clearing incomplete buffer");
    jsonBuffer = "";
    braceCount = 0;
    inString = false;
  }
  lastNotifyTime = now;
  
  // 受信データをバッファに追加
  for (size_t i = 0; i < actualLen; i++) {
    char c = (char)pData[i];
    
    // 改行は無視
    if (c == '\n' || c == '\r') continue;
    
    // バッファが空で { 以外が来たら無視
    if (jsonBuffer.length() == 0 && c != '{') continue;
    
    jsonBuffer += c;
    
    // 文字列内のブレースは無視
    if (c == '"' && (jsonBuffer.length() < 2 || jsonBuffer.charAt(jsonBuffer.length() - 2) != '\\')) {
      inString = !inString;
    }
    
    if (!inString) {
      if (c == '{') {
        braceCount++;
      } else if (c == '}') {
        braceCount--;
        
        // ブレースが閉じて、バッファが{で始まっていたら完全なJSON
        if (braceCount == 0 && jsonBuffer.length() > 10 && jsonBuffer.charAt(0) == '{') {
          Serial.print("Complete JSON, length: ");
          Serial.println(jsonBuffer.length());
          
          // ArduinoJsonでパース
          JsonDocument doc;
          DeserializationError error = deserializeJson(doc, jsonBuffer);
          
          if (error) {
            Serial.print("JSON parse error: ");
            Serial.println(error.c_str());
            // パース失敗時は部分パースを試みる
            parsePartialJson(jsonBuffer);
          } else {
            // 完全なJSONをパース
            parseCompleteJson(doc);
          }
          
          jsonBuffer = "";
          braceCount = 0;
          inString = false;
        }
      }
    }
  }
  
  // バッファが大きくなりすぎたらクリアして部分パースを試みる
  if (jsonBuffer.length() > 2000) {
    Serial.print("Buffer large (");
    Serial.print(jsonBuffer.length());
    Serial.println("), trying partial parse");
    parsePartialJson(jsonBuffer);
    jsonBuffer = "";
    braceCount = 0;
    inString = false;
  }
  
  lastDataReceived = millis();
}

// 完全なJSONをパース
void parseCompleteJson(JsonDocument& doc) {
  sensorData.timestamp = doc["timestamp"] | 0L;
  
  // 加速度センサー
  if (doc["accelerometer"].is<JsonObject>()) {
    sensorData.accelX = doc["accelerometer"]["x"] | 0.0f;
    sensorData.accelY = doc["accelerometer"]["y"] | 0.0f;
    sensorData.accelZ = doc["accelerometer"]["z"] | 0.0f;
    sensorData.hasAccel = true;
  }
  
  // 重力センサー
  if (doc["gravity"].is<JsonObject>()) {
    sensorData.gravX = doc["gravity"]["x"] | 0.0f;
    sensorData.gravY = doc["gravity"]["y"] | 0.0f;
    sensorData.gravZ = doc["gravity"]["z"] | 0.0f;
    sensorData.hasGrav = true;
  }
  
  // ジャイロセンサー
  if (doc["gyroscope"].is<JsonObject>()) {
    sensorData.gyroX = doc["gyroscope"]["x"] | 0.0f;
    sensorData.gyroY = doc["gyroscope"]["y"] | 0.0f;
    sensorData.gyroZ = doc["gyroscope"]["z"] | 0.0f;
    sensorData.hasGyro = true;
  }
  
  // 磁気センサー
  if (doc["magnetometer"].is<JsonObject>()) {
    sensorData.magX = doc["magnetometer"]["x"] | 0.0f;
    sensorData.magY = doc["magnetometer"]["y"] | 0.0f;
    sensorData.magZ = doc["magnetometer"]["z"] | 0.0f;
    sensorData.hasMag = true;
  }
  
  // 光センサー
  if (doc["light"].is<JsonObject>()) {
    sensorData.light = doc["light"]["lux"] | 0.0f;
    sensorData.hasLight = true;
  }
  
  // 気圧センサー
  if (doc["pressure"].is<float>()) {
    sensorData.pressure = doc["pressure"] | 0.0f;
    sensorData.hasPressure = true;
  }
  
  // 温度センサー
  if (doc["temperature"].is<float>()) {
    sensorData.temperature = doc["temperature"] | 0.0f;
    sensorData.hasTemp = true;
  }
  
  // 湿度センサー
  if (doc["humidity"].is<float>()) {
    sensorData.humidity = doc["humidity"] | 0.0f;
    sensorData.hasHumidity = true;
  }
  
  // 近接センサー
  if (doc["proximity"].is<JsonObject>()) {
    sensorData.proximity = doc["proximity"]["distance"] | 0.0f;
    sensorData.hasProximity = true;
  }
  
  // GPS/位置情報
  if (doc["gps"].is<JsonObject>()) {
    sensorData.latitude = doc["gps"]["latitude"] | 0.0;
    sensorData.longitude = doc["gps"]["longitude"] | 0.0;
    sensorData.altitude = doc["gps"]["altitude"] | 0.0f;
    sensorData.speed = doc["gps"]["speed"] | 0.0f;
    sensorData.accuracy = doc["gps"]["accuracy"] | 0.0f;
    sensorData.hasGps = true;
  }
  
  lastError = "";
  Serial.println("Sensor data updated (complete JSON)");
}

// 文字列から数値を抽出するヘルパー関数
float extractFloat(const String& data, const String& key) {
  int idx = data.indexOf(key);
  if (idx == -1) return NAN;
  
  idx = data.indexOf(':', idx);
  if (idx == -1) return NAN;
  
  idx++; // ':' の次へ
  while (idx < data.length() && (data.charAt(idx) == ' ' || data.charAt(idx) == '"')) {
    idx++;
  }
  
  String numStr = "";
  while (idx < data.length()) {
    char c = data.charAt(idx);
    if (c == '-' || c == '.' || (c >= '0' && c <= '9') || c == 'E' || c == 'e' || c == '+') {
      numStr += c;
      idx++;
    } else {
      break;
    }
  }
  
  if (numStr.length() == 0) return NAN;
  return numStr.toFloat();
}

// 部分的なJSONをパースしてセンサーデータを抽出
void parsePartialJson(const String& data) {
  bool updated = false;
  
  // 加速度センサー
  if (data.indexOf("\"accelerometer\"") != -1) {
    float x = extractFloat(data, "\"accelerometer\":{\"x\"");
    float y = extractFloat(data, "\"y\"");
    float z = extractFloat(data, "\"z\"");
    
    if (!isnan(x) && !isnan(y) && !isnan(z)) {
      sensorData.accelX = x;
      sensorData.accelY = y;
      sensorData.accelZ = z;
      sensorData.hasAccel = true;
      updated = true;
    }
  }
  
  // 重力センサー
  if (data.indexOf("\"gravity\"") != -1) {
    int gravIdx = data.indexOf("\"gravity\"");
    String gravData = data.substring(gravIdx);
    float x = extractFloat(gravData, "\"x\"");
    float y = extractFloat(gravData, "\"y\"");
    float z = extractFloat(gravData, "\"z\"");
    
    if (!isnan(x) && !isnan(y) && !isnan(z)) {
      sensorData.gravX = x;
      sensorData.gravY = y;
      sensorData.gravZ = z;
      sensorData.hasGrav = true;
      updated = true;
    }
  }
  
  // ジャイロセンサー
  if (data.indexOf("\"gyroscope\"") != -1) {
    int gyroIdx = data.indexOf("\"gyroscope\"");
    String gyroData = data.substring(gyroIdx);
    float x = extractFloat(gyroData, "\"x\"");
    float y = extractFloat(gyroData, "\"y\"");
    float z = extractFloat(gyroData, "\"z\"");
    
    if (!isnan(x) && !isnan(y) && !isnan(z)) {
      sensorData.gyroX = x;
      sensorData.gyroY = y;
      sensorData.gyroZ = z;
      sensorData.hasGyro = true;
      updated = true;
    }
  }
  
  // 光センサー
  if (data.indexOf("\"light\"") != -1) {
    int lightIdx = data.indexOf("\"light\"");
    String lightData = data.substring(lightIdx);
    float lux = extractFloat(lightData, "\"lux\"");
    
    if (!isnan(lux)) {
      sensorData.light = lux;
      sensorData.hasLight = true;
      updated = true;
    }
  }
  
  // 磁気センサー
  if (data.indexOf("\"magnetometer\"") != -1) {
    int magIdx = data.indexOf("\"magnetometer\"");
    String magData = data.substring(magIdx);
    float x = extractFloat(magData, "\"x\"");
    float y = extractFloat(magData, "\"y\"");
    float z = extractFloat(magData, "\"z\"");
    
    if (!isnan(x) && !isnan(y) && !isnan(z)) {
      sensorData.magX = x;
      sensorData.magY = y;
      sensorData.magZ = z;
      sensorData.hasMag = true;
      updated = true;
    }
  }
  
  // 近接センサー
  if (data.indexOf("\"proximity\"") != -1) {
    int proxIdx = data.indexOf("\"proximity\"");
    String proxData = data.substring(proxIdx);
    float dist = extractFloat(proxData, "\"distance\"");
    
    if (!isnan(dist)) {
      sensorData.proximity = dist;
      sensorData.hasProximity = true;
      updated = true;
    }
  }
  
  if (updated) {
    Serial.println("Sensor data updated (partial)");
    lastError = "";
  }
}

// BLEスキャン結果クラス
class MyAdvertisedDeviceCallbacks: public NimBLEScanCallbacks {
public:
  void onResult(const NimBLEAdvertisedDevice* advertisedDevice) override {
    Serial.println("!!! Scan callback triggered !!!");
    Serial.print("BLE Device found: ");
    if (advertisedDevice->haveName()) {
      Serial.print("Name: ");
      Serial.print(advertisedDevice->getName().c_str());
    }
    Serial.print(", Address: ");
    Serial.print(advertisedDevice->getAddress().toString().c_str());
    
    // AndroidアプリのサービスUUIDを持つデバイスのみ追加
    if (advertisedDevice->haveServiceUUID() && advertisedDevice->getServiceUUID().equals(serviceUUID)) {
      Serial.print(", serviceUUID: ");
      Serial.print(advertisedDevice->getServiceUUID().toString().c_str());
      Serial.print(", rssi: ");
      Serial.println(advertisedDevice->getRSSI());
      
      // 重複チェック - 同じアドレスのデバイスは追加しない
      String newAddress = advertisedDevice->getAddress().toString().c_str();
      bool isDuplicate = false;
      for (const auto& dev : deviceList) {
        if (dev.address == newAddress) {
          isDuplicate = true;
          Serial.println("Device already in list, skipping");
          break;
        }
      }
      
      if (!isDuplicate) {
        DeviceInfo device;
        device.name = advertisedDevice->haveName() ? advertisedDevice->getName().c_str() : "Unknown";
        device.address = newAddress;
        device.rssi = advertisedDevice->getRSSI();
        device.addressType = advertisedDevice->getAddress().getType();
        
        Serial.print("Address type: ");
        Serial.println(device.addressType);
        
        deviceList.push_back(device);
        Serial.println("Added to device list");
      }
    } else {
      Serial.print(", rssi: ");
      Serial.println(advertisedDevice->getRSSI());
    }
  }
  
  void onScanEnd(const NimBLEScanResults& results, int reason) override {
    Serial.print("Scan ended, reason: ");
    Serial.print(reason);
    Serial.print(", found ");
    Serial.print(results.getCount());
    Serial.println(" devices in results");
    Serial.print("Matching devices in list: ");
    Serial.println(deviceList.size());
    
    // スキャン完了後の状態更新
    if (deviceList.size() > 0) {
      currentState = STATE_DEVICE_LIST;
    } else {
      lastError = "No devices found";
      currentState = STATE_ERROR;
    }
  }
};

// 永続的なコールバックオブジェクト
MyAdvertisedDeviceCallbacks* scanCallbacks;

// BLE接続処理（NimBLE バージョン）
bool connectToServer(String address, uint8_t addressType) {
  Serial.print("Connecting to ");
  Serial.print(address);
  Serial.print(" (type: ");
  Serial.print(addressType);
  Serial.println(")");
  
  currentState = STATE_CONNECTING;
  updateDisplay(); // 接続画面を即時表示
  
  if (pClient != nullptr) {
    NimBLEDevice::deleteClient(pClient);
    pClient = nullptr;
  }
  
  pClient = NimBLEDevice::createClient();
  Serial.println(" - Created client");
  
  pClient->setClientCallbacks(new MyClientCallback());
  
  // アドレスからBLEAddressオブジェクトを作成（スキャン時のアドレスタイプを使用）
  NimBLEAddress bleAddress(address.c_str(), addressType);
  Serial.print(" - BLE Address: ");
  Serial.print(bleAddress.toString().c_str());
  Serial.print(", type: ");
  Serial.println(addressType);
  
  // デバイスに接続
  Serial.println(" - Attempting to connect...");
  updateDisplay(); // 接続中画面を更新
  
  if (!pClient->connect(bleAddress)) {
    Serial.println(" - Failed to connect");
    lastError = "Connection Failed";
    currentState = STATE_DEVICE_LIST;
    updateDisplay();
    return false;
  }
  Serial.println(" - Connected to server");
  
  // MTUを表示
  uint16_t mtu = pClient->getMTU();
  Serial.print(" - MTU: ");
  Serial.println(mtu);
  
  // 特定サービスを直接取得（NimBLE は自動探索）
  Serial.println(" - Getting service...");
  updateDisplay();
  
  NimBLERemoteService* pRemoteService = pClient->getService(serviceUUID);
  
  if (pRemoteService == nullptr) {
    Serial.print("Failed to find service UUID: ");
    Serial.println(serviceUUID.toString().c_str());
    pClient->disconnect();
    lastError = "Service Not Found";
    currentState = STATE_DEVICE_LIST;
    updateDisplay();
    return false;
  }
  Serial.println(" - Found service");
  
  // キャラクタリスティックを取得
  pRemoteCharacteristic = pRemoteService->getCharacteristic(charUUID);
  if (pRemoteCharacteristic == nullptr) {
    Serial.print("Failed to find characteristic UUID: ");
    Serial.println(charUUID.toString().c_str());
    pClient->disconnect();
    lastError = "Characteristic Not Found";
    currentState = STATE_DEVICE_LIST;
    updateDisplay();
    return false;
  }
  Serial.println(" - Found characteristic");
  
  // Notificationを有効化（NimBLE は subscribe を使用）
  if(pRemoteCharacteristic->canNotify()) {
    pRemoteCharacteristic->subscribe(true, notifyCallback);
    Serial.println(" - Subscribed to notifications");
  }
  
  connected = true;
  currentState = STATE_CONNECTED;
  lastError = "";
  updateDisplay(); // 接続完了画面を表示
  return true;
}

// BLEスキャン開始
void startScan() {
  Serial.println("Starting BLE scan...");
  currentState = STATE_SCANNING;
  deviceList.clear();
  selectedDevice = 0;
  
  // 永続的なコールバックオブジェクトを作成
  if (scanCallbacks == nullptr) {
    scanCallbacks = new MyAdvertisedDeviceCallbacks();
  }
  
  NimBLEScan* pBLEScan = NimBLEDevice::getScan();
  
  // コールバック設定
  pBLEScan->setScanCallbacks(scanCallbacks, false);
  
  // スキャンパラメータ設定
  pBLEScan->setActiveScan(true);  // アクティブスキャン
  pBLEScan->setMaxResults(0);     // コールバックのみ使用
  
  Serial.println("Starting 10 second scan...");
  
  // スキャン実行（非同期）
  // start(duration_ms, is_continue, restart)
  pBLEScan->start(10000, false, true);  // 10秒
  
  Serial.println("Scan started, waiting for callbacks...");
  // スキャン完了はonScanEndコールバックで通知される
}

// 画面表示更新
void updateDisplay() {
  M5.Display.clear();
  
  switch (currentState) {
    case STATE_SCANNING:
      M5.Display.setCursor(0, 0);
      M5.Display.setTextSize(2);
      M5.Display.println("Scanning...");
      M5.Display.setTextSize(1);
      M5.Display.println("Searching for devices");
      break;
      
    case STATE_DEVICE_LIST:
      M5.Display.setCursor(0, 0);
      M5.Display.setTextSize(2);
      M5.Display.println("Select Device");
      M5.Display.setTextSize(1);
      
      if (deviceList.size() == 0) {
        M5.Display.println("No devices found");
        M5.Display.println("BtnB: Rescan");
      } else {
        // デバイスリスト表示（最大3件）
        for (int i = 0; i < min(3, (int)deviceList.size()); i++) {
          if (i == selectedDevice) {
            M5.Display.print("> ");
          } else {
            M5.Display.print("  ");
          }
          M5.Display.print(deviceList[i].name);
          M5.Display.print(" (");
          M5.Display.print(deviceList[i].rssi);
          M5.Display.println(")");
        }
        
        M5.Display.println();
        M5.Display.println("BtnA: Up  BtnB: Connect");
        M5.Display.println("BtnC: Down  BtnB: Rescan");
      }
      break;
      
    case STATE_CONNECTING:
      M5.Display.setCursor(0, 0);
      M5.Display.setTextSize(2);
      M5.Display.println("Connecting...");
      M5.Display.setTextSize(1);
      M5.Display.println("Please wait");
      break;
      
    case STATE_CONNECTED:
      M5.Display.setCursor(0, 0);
      M5.Display.setTextSize(2);
      M5.Display.println("Connected");
      M5.Display.setTextSize(1);
      
      if (lastDataReceived > 0) {
        M5.Display.print("Last data: ");
        M5.Display.print((millis() - lastDataReceived) / 1000);
        M5.Display.println("s ago");
      }
      
      M5.Display.println();
      
      // 加速度
      if (sensorData.hasAccel) {
        M5.Display.printf("Acc:%.1f,%.1f,%.1f\n", 
                         sensorData.accelX, sensorData.accelY, sensorData.accelZ);
      }
      
      // 重力
      if (sensorData.hasGrav) {
        M5.Display.printf("Grv:%.1f,%.1f,%.1f\n", 
                         sensorData.gravX, sensorData.gravY, sensorData.gravZ);
      }
      
      // ジャイロ
      if (sensorData.hasGyro) {
        M5.Display.printf("Gyr:%.1f,%.1f,%.1f\n", 
                         sensorData.gyroX, sensorData.gyroY, sensorData.gyroZ);
      }
      
      // 磁気
      if (sensorData.hasMag) {
        M5.Display.printf("Mag:%.0f,%.0f,%.0f\n", 
                         sensorData.magX, sensorData.magY, sensorData.magZ);
      }
      
      // 光センサー
      if (sensorData.hasLight) {
        M5.Display.printf("Light:%.0f lux\n", sensorData.light);
      }
      
      // 近接センサー
      if (sensorData.hasProximity) {
        M5.Display.printf("Prox:%.1f cm\n", sensorData.proximity);
      }
      
      // 気圧
      if (sensorData.hasPressure) {
        M5.Display.printf("Press:%.1f hPa\n", sensorData.pressure);
      }
      
      // 温度
      if (sensorData.hasTemp) {
        M5.Display.printf("Temp:%.1f C\n", sensorData.temperature);
      }
      
      // 湿度
      if (sensorData.hasHumidity) {
        M5.Display.printf("Hum:%.1f%%\n", sensorData.humidity);
      }
      
      // GPS
      if (sensorData.hasGps) {
        M5.Display.printf("Lat:%.6f\n", sensorData.latitude);
        M5.Display.printf("Lon:%.6f\n", sensorData.longitude);
        if (sensorData.altitude != 0) {
          M5.Display.printf("Alt:%.1fm Spd:%.1fm/s\n", sensorData.altitude, sensorData.speed);
        }
      }
      
      M5.Display.println();
      M5.Display.println("BtnB: Disconnect");
      break;
      
    case STATE_ERROR:
      M5.Display.setCursor(0, 0);
      M5.Display.setTextSize(2);
      M5.Display.println("Error");
      M5.Display.setTextSize(1);
      M5.Display.println(lastError);
      M5.Display.println();
      M5.Display.println("BtnB: Back");
      break;
  }
}

// ボタン処理
void handleButtons() {
  if (currentState == STATE_DEVICE_LIST) {
    // BtnA: 上に移動
    if (M5.BtnA.wasPressed()) {
      if (deviceList.size() > 0) {
        selectedDevice--;
        if (selectedDevice < 0) {
          selectedDevice = deviceList.size() - 1;
        }
        updateDisplay();
      }
    }
    
    // BtnB: 接続 or 再スキャン
    if (M5.BtnB.wasPressed()) {
      if (deviceList.size() > 0) {
        // デバイスに接続
        Serial.print("Selected device: ");
        Serial.print(deviceList[selectedDevice].name);
        Serial.print(" (");
        Serial.print(deviceList[selectedDevice].address);
        Serial.println(")");
        connectToServer(deviceList[selectedDevice].address, deviceList[selectedDevice].addressType);
        updateDisplay();
      } else {
        // 再スキャン
        startScan();
        updateDisplay();
      }
    }
    
    // BtnC: 下に移動
    if (M5.BtnC.wasPressed()) {
      if (deviceList.size() > 0) {
        selectedDevice++;
        if (selectedDevice >= (int)deviceList.size()) {
          selectedDevice = 0;
        }
        updateDisplay();
      }
    }
  } else if (currentState == STATE_CONNECTED) {
    // BtnB: 切断
    if (M5.BtnB.wasPressed()) {
      if (pClient != nullptr && connected) {
        pClient->disconnect();
      }
      connected = false;
      currentState = STATE_DEVICE_LIST;
      updateDisplay();
    }
  } else if (currentState == STATE_ERROR) {
    // BtnB: 戻る
    if (M5.BtnB.wasPressed()) {
      currentState = STATE_DEVICE_LIST;
      lastError = "";
      updateDisplay();
    }
  }
}

void setup() {
  M5.begin();
  M5.Display.setTextSize(1);
  M5.Display.setTextColor(WHITE);
  M5.Display.setCursor(0, 0);
  
  Serial.begin(115200);
  Serial.println("M5Stack BLE Sensor Receiver (NimBLE)");
  
  // NimBLE 初期化（MTUを大きく設定）
  NimBLEDevice::init("");
  NimBLEDevice::setMTU(517);  // 最大MTUを設定（BLE 4.2以降）
  Serial.print("MTU set to: ");
  Serial.println(NimBLEDevice::getMTU());
  Serial.println("NimBLE initialized");
  
  // 最初のスキャン開始
  startScan();
  updateDisplay();
}

void loop() {
  M5.update();
  
  // スキャン中は定期的に表示更新
  static unsigned long lastDisplayUpdate = 0;
  if (millis() - lastDisplayUpdate >= 500) {
    updateDisplay();
    lastDisplayUpdate = millis();
  }
  
  handleButtons();
  delay(50);
}

/*
 * M5Stack BLE Sensor Data Receiver with Device Selection Menu
 * 
 * このスケッチは、Android Sensor BLE アプリからセンサーデータを受信し、
 * M5Stackの画面に表示します。
 * BLEデバイスをスキャンして選択できるメニュー画面を搭載しています。
 * 
 * 必要なライブラリ:
 * - M5Unified (https://github.com/m5stack/M5Unified)
 * - ArduinoJson (https://arduinojson.org/)
 * 
 * 対応デバイス: M5Stack Basic, Core2, CoreS3など
 * 
 * 操作方法:
 * - BtnA (左ボタン): 上に移動 / 再スキャン
 * - BtnB (中央ボタン): 選択 / 切断
 * - BtnC (右ボタン): 下に移動
 */

#include <M5Unified.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <ArduinoJson.h>
#include <vector>

// BLE UUIDs (Androidアプリと同じ)
static BLEUUID serviceUUID("0000180A-0000-1000-8000-00805F9B34FB");
static BLEUUID charUUID("00002A57-0000-1000-8000-00805F9B34FB");

// アプリケーション状態
enum AppState {
  STATE_SCANNING,
  STATE_DEVICE_LIST,
  STATE_CONNECTING,
  STATE_CONNECTED
};

AppState currentState = STATE_SCANNING;
AppState lastState = STATE_SCANNING; // 前回の状態を記録

// BLE関連の変数
static boolean connected = false;
static BLERemoteCharacteristic* pRemoteCharacteristic;
static BLEClient* pClient = nullptr;

// デバイスリスト
struct BLEDeviceInfo {
  String address;
  String name;
  int rssi;
};

std::vector<BLEDeviceInfo> deviceList;
int selectedDevice = 0;
int scrollOffset = 0;
const int MAX_DISPLAY_DEVICES = 8;

// センサーデータ構造体
struct SensorData {
  long timestamp;
  struct {
    float x, y, z;
  } accelerometer;
  struct {
    float x, y, z;
  } gyroscope;
  struct {
    float lux;
  } light;
  struct {
    double latitude, longitude, altitude;
    float accuracy, speed;
  } gps;
  struct {
    float x, y, z;
  } magnetometer;
  struct {
    float distance;
  } proximity;
  struct {
    float x, y, z;
  } gravity;
  
  bool hasAccelerometer = false;
  bool hasGyroscope = false;
  bool hasLight = false;
  bool hasGps = false;
  bool hasMagnetometer = false;
  bool hasProximity = false;
  bool hasGravity = false;
};

SensorData sensorData;
String lastError = "";
unsigned long lastDataReceived = 0;
bool scanComplete = false;

// Notificationコールバック関数
static void notifyCallback(
  BLERemoteCharacteristic* pBLERemoteCharacteristic,
  uint8_t* pData,
  size_t length,
  bool isNotify) {
  
  Serial.print("Received data: ");
  Serial.println(length);
  
  // JSON文字列をパース
  String jsonStr = String((char*)pData);
  jsonStr = jsonStr.substring(0, length);
  
  Serial.println(jsonStr);
  
  // ArduinoJsonを使用してパース
  StaticJsonDocument<2048> doc;
  DeserializationError error = deserializeJson(doc, jsonStr);
  
  if (error) {
    Serial.print("JSON parse error: ");
    Serial.println(error.c_str());
    lastError = "JSON Parse Error";
    return;
  }
  
  // データを構造体に格納
  sensorData.timestamp = doc["timestamp"] | 0L;
  
  // 加速度センサー
  if (!doc["accelerometer"].isNull()) {
    sensorData.accelerometer.x = doc["accelerometer"]["x"] | 0.0f;
    sensorData.accelerometer.y = doc["accelerometer"]["y"] | 0.0f;
    sensorData.accelerometer.z = doc["accelerometer"]["z"] | 0.0f;
    sensorData.hasAccelerometer = true;
  }
  
  // ジャイロスコープ
  if (!doc["gyroscope"].isNull()) {
    sensorData.gyroscope.x = doc["gyroscope"]["x"] | 0.0f;
    sensorData.gyroscope.y = doc["gyroscope"]["y"] | 0.0f;
    sensorData.gyroscope.z = doc["gyroscope"]["z"] | 0.0f;
    sensorData.hasGyroscope = true;
  }
  
  // 光センサー
  if (!doc["light"].isNull()) {
    sensorData.light.lux = doc["light"]["lux"] | 0.0f;
    sensorData.hasLight = true;
  }
  
  // GPS
  if (!doc["gps"].isNull()) {
    sensorData.gps.latitude = doc["gps"]["latitude"] | 0.0;
    sensorData.gps.longitude = doc["gps"]["longitude"] | 0.0;
    sensorData.gps.altitude = doc["gps"]["altitude"] | 0.0;
    sensorData.gps.accuracy = doc["gps"]["accuracy"] | 0.0f;
    sensorData.gps.speed = doc["gps"]["speed"] | 0.0f;
    sensorData.hasGps = true;
  }
  
  // 磁気センサー
  if (!doc["magnetometer"].isNull()) {
    sensorData.magnetometer.x = doc["magnetometer"]["x"] | 0.0f;
    sensorData.magnetometer.y = doc["magnetometer"]["y"] | 0.0f;
    sensorData.magnetometer.z = doc["magnetometer"]["z"] | 0.0f;
    sensorData.hasMagnetometer = true;
  }
  
  // 近接センサー
  if (!doc["proximity"].isNull()) {
    sensorData.proximity.distance = doc["proximity"]["distance"] | 0.0f;
    sensorData.hasProximity = true;
  }
  
  // 重力センサー
  if (!doc["gravity"].isNull()) {
    sensorData.gravity.x = doc["gravity"]["x"] | 0.0f;
    sensorData.gravity.y = doc["gravity"]["y"] | 0.0f;
    sensorData.gravity.z = doc["gravity"]["z"] | 0.0f;
    sensorData.hasGravity = true;
  }
  
  lastDataReceived = millis();
  lastError = "";
}

// BLE接続コールバッククラス
class MyClientCallback : public BLEClientCallbacks {
  void onConnect(BLEClient* pclient) {
    Serial.println("Connected to BLE device");
    connected = true;
    currentState = STATE_CONNECTED;
  }

  void onDisconnect(BLEClient* pclient) {
    connected = false;
    Serial.println("Disconnected from BLE device");
    lastError = "Disconnected";
    currentState = STATE_DEVICE_LIST;
  }
};

// BLE接続処理
bool connectToServer(String address) {
  Serial.print("Connecting to ");
  Serial.println(address);
  
  currentState = STATE_CONNECTING;
  
  if (pClient != nullptr) {
    delete pClient;
  }
  
  pClient = BLEDevice::createClient();
  Serial.println(" - Created client");
  
  pClient->setClientCallbacks(new MyClientCallback());
  
  // アドレスからBLEAddressオブジェクトを作成
  BLEAddress bleAddress(address.c_str());
  Serial.print(" - BLE Address: ");
  Serial.println(bleAddress.toString().c_str());
  
  // 接続タイムアウトを設定（10秒）
  pClient->setConnectTimeout(10);
  
  // デバイスに接続
  Serial.println(" - Attempting to connect...");
  if (!pClient->connect(bleAddress)) {
    Serial.println(" - Failed to connect");
    lastError = "Connection Failed";
    currentState = STATE_DEVICE_LIST;
    return false;
  }
  Serial.println(" - Connected to server");
  
  // サービスを取得
  BLERemoteService* pRemoteService = pClient->getService(serviceUUID);
  if (pRemoteService == nullptr) {
    Serial.print("Failed to find service UUID: ");
    Serial.println(serviceUUID.toString().c_str());
    pClient->disconnect();
    lastError = "Service Not Found";
    currentState = STATE_DEVICE_LIST;
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
    return false;
  }
  Serial.println(" - Found characteristic");
  
  // Notificationを有効化
  if(pRemoteCharacteristic->canNotify()) {
    pRemoteCharacteristic->registerForNotify(notifyCallback);
    Serial.println(" - Registered for notifications");
  }
  
  connected = true;
  currentState = STATE_CONNECTED;
  lastError = "";
  return true;
}

// BLEスキャンコールバッククラス
class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) {
    Serial.print("BLE Device found: ");
    Serial.println(advertisedDevice.toString().c_str());
    
    // 目的のサービスUUIDを持つデバイスのみリストに追加
    if (advertisedDevice.haveServiceUUID() && advertisedDevice.isAdvertisingService(serviceUUID)) {
      BLEDeviceInfo info;
      info.address = advertisedDevice.getAddress().toString().c_str();
      info.name = advertisedDevice.haveName() ? advertisedDevice.getName().c_str() : "Unknown";
      info.rssi = advertisedDevice.getRSSI();
      
      // 重複チェック
      bool exists = false;
      for (auto& dev : deviceList) {
        if (dev.address == info.address) {
          exists = true;
          dev.rssi = info.rssi; // RSSIを更新
          break;
        }
      }
      
      if (!exists) {
        deviceList.push_back(info);
        Serial.println("Added to device list");
      }
    }
  }
};

void startScan() {
  deviceList.clear();
  selectedDevice = 0;
  scrollOffset = 0;
  scanComplete = false;
  currentState = STATE_SCANNING;
  
  Serial.println("Starting BLE scan...");
  Serial.print("[DEBUG] currentState = ");
  Serial.println(currentState);
  
  BLEScan* pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setInterval(1349);
  pBLEScan->setWindow(449);
  pBLEScan->setActiveScan(true);
  
  Serial.println("[DEBUG] Starting BLE scan for 5 seconds...");
  
  // 5秒間の同期スキャンを実行
  pBLEScan->start(5, false);
  
  Serial.println("[DEBUG] BLE scan completed");
  
  // スキャン完了後の処理
  scanComplete = true;
  currentState = STATE_DEVICE_LIST;
  Serial.print("Scan complete. Found ");
  Serial.print(deviceList.size());
  Serial.println(" devices");
  Serial.println("[DEBUG] State changed to STATE_DEVICE_LIST");
}

void setup() {
  // M5Stackの初期化
  auto cfg = M5.config();
  M5.begin(cfg);
  
  // ディスプレイの設定
  M5.Display.setRotation(1);
  M5.Display.setTextSize(1);
  M5.Display.setTextColor(WHITE);
  M5.Display.fillScreen(BLACK);
  M5.Display.setCursor(0, 0);
  M5.Display.println("BLE Sensor Receiver");
  M5.Display.println("Initializing...");
  
  Serial.begin(115200);
  Serial.println("Starting BLE Sensor Receiver...");
  
  // BLEの初期化
  BLEDevice::init("");
  
  // 初回スキャン開始
  startScan();
  
  // 初期画面更新
  updateDisplay();
}

void loop() {
  M5.update();
  
  // ボタン処理
  handleButtons();
  
  // 注: スキャンはstartScan()内で同期的に実行されるため、
  // loop()内でのスキャン完了チェックは不要
  
  // 状態が変わったときのみ画面更新
  if (currentState != lastState) {
    updateDisplay();
    lastState = currentState;
  }
  
  // 接続中は定期的にデータ部分を更新（500msごと）
  static unsigned long lastDataUpdate = 0;
  if (currentState == STATE_CONNECTED && (millis() - lastDataUpdate >= 500)) {
    updateSensorDataDisplay();
    lastDataUpdate = millis();
  }
  
  delay(50);
}

void handleButtons() {
  if (currentState == STATE_DEVICE_LIST) {
    // BtnA: 上に移動
    if (M5.BtnA.wasPressed()) {
      if (deviceList.size() > 0) {
        selectedDevice--;
        if (selectedDevice < 0) {
          selectedDevice = deviceList.size() - 1;
        }
        // スクロール調整
        if (selectedDevice < scrollOffset) {
          scrollOffset = selectedDevice;
        } else if (selectedDevice >= scrollOffset + MAX_DISPLAY_DEVICES) {
          scrollOffset = selectedDevice - MAX_DISPLAY_DEVICES + 1;
        }
      }
    }
    
    // BtnB: 選択 or 再スキャン
    if (M5.BtnB.wasPressed()) {
      if (deviceList.size() > 0) {
        // デバイスに接続
        Serial.print("[DEBUG] Selected device: ");
        Serial.print(deviceList[selectedDevice].name);
        Serial.print(" (");
        Serial.print(deviceList[selectedDevice].address);
        Serial.println(")");
        connectToServer(deviceList[selectedDevice].address);
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
        if (selectedDevice >= deviceList.size()) {
          selectedDevice = 0;
        }
        // スクロール調整
        if (selectedDevice < scrollOffset) {
          scrollOffset = selectedDevice;
        } else if (selectedDevice >= scrollOffset + MAX_DISPLAY_DEVICES) {
          scrollOffset = selectedDevice - MAX_DISPLAY_DEVICES + 1;
        }
      }
    }
  } else if (currentState == STATE_CONNECTED) {
    // BtnB: 切断
    if (M5.BtnB.wasPressed()) {
      if (pClient != nullptr && connected) {
        pClient->disconnect();
        connected = false;
        currentState = STATE_DEVICE_LIST;
      }
    }
    
    // BtnA: 再スキャン
    if (M5.BtnA.wasPressed()) {
      if (pClient != nullptr && connected) {
        pClient->disconnect();
        connected = false;
      }
      startScan();
    }
  } else if (currentState == STATE_SCANNING) {
    // スキャン中はボタン無効
  }
}

void updateDisplay() {
  M5.Display.fillScreen(BLACK);
  M5.Display.setCursor(0, 0);
  M5.Display.setTextSize(2);
  
  Serial.print("[DEBUG] updateDisplay called, currentState = ");
  Serial.println(currentState);
  
  if (currentState == STATE_SCANNING) {
    // スキャン中の表示
    M5.Display.setTextColor(YELLOW);
    M5.Display.println("Scanning...");
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(WHITE);
    M5.Display.println("");
    M5.Display.printf("Found: %d devices\n", deviceList.size());
    M5.Display.println("");
    M5.Display.println("Please wait...");
    
  } else if (currentState == STATE_DEVICE_LIST) {
    // デバイスリスト表示
    M5.Display.setTextColor(CYAN);
    M5.Display.println("Select Device");
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(WHITE);
    M5.Display.println("");
    
    if (deviceList.size() == 0) {
      M5.Display.println("No devices found");
      M5.Display.println("");
      M5.Display.setTextColor(YELLOW);
      M5.Display.println("[BtnB] Rescan");
    } else {
      // デバイスリストを表示
      int y = 30;
      int displayCount = min((int)deviceList.size(), MAX_DISPLAY_DEVICES);
      
      for (int i = 0; i < displayCount; i++) {
        int index = scrollOffset + i;
        if (index >= deviceList.size()) break;
        
        M5.Display.setCursor(0, y);
        
        // 選択中のデバイスをハイライト
        if (index == selectedDevice) {
          M5.Display.setTextColor(BLACK, WHITE);
          M5.Display.print(">");
        } else {
          M5.Display.setTextColor(WHITE, BLACK);
          M5.Display.print(" ");
        }
        
        // デバイス名とRSSI
        String displayName = deviceList[index].name;
        if (displayName.length() > 20) {
          displayName = displayName.substring(0, 20);
        }
        M5.Display.printf("%-20s %ddBm", displayName.c_str(), deviceList[index].rssi);
        M5.Display.setTextColor(WHITE, BLACK);
        
        y += 20;
      }
      
      // スクロールインジケーター
      if (deviceList.size() > MAX_DISPLAY_DEVICES) {
        M5.Display.setCursor(0, 210);
        M5.Display.setTextColor(YELLOW);
        M5.Display.printf("%d/%d", selectedDevice + 1, deviceList.size());
      }
      
      // ボタンガイド
      M5.Display.setCursor(0, 225);
      M5.Display.setTextColor(GREEN);
      M5.Display.print("[A]Up [B]Select [C]Down");
    }
    
    if (lastError != "") {
      M5.Display.setCursor(0, 200);
      M5.Display.setTextColor(RED);
      M5.Display.print("Error: ");
      M5.Display.println(lastError);
    }
    
  } else if (currentState == STATE_CONNECTING) {
    // 接続中の表示
    M5.Display.setTextColor(YELLOW);
    M5.Display.println("Connecting...");
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(WHITE);
    M5.Display.println("");
    M5.Display.println("Please wait...");
    
  } else if (currentState == STATE_CONNECTED) {
    // センサーデータ表示（初回のみ全画面表示）
    M5.Display.fillScreen(BLACK);
    M5.Display.setCursor(0, 0);
    M5.Display.setTextSize(2);
    M5.Display.setTextColor(GREEN);
    M5.Display.println("Connected");
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(WHITE);
    M5.Display.println("");
    M5.Display.setTextColor(GREEN);
    M5.Display.setCursor(0, 225);
    M5.Display.print("[A]Rescan [B]Disconnect");
  }
}

void updateSensorDataDisplay() {
  // データ表示部分のみ更新（画面クリアなし）
  
  // データ受信タイムアウトチェック
  if (millis() - lastDataReceived > 5000 && lastDataReceived > 0) {
    // データ部分をクリア
    M5.Display.fillRect(0, 30, 320, 190, BLACK);
    M5.Display.setCursor(0, 100);
    M5.Display.setTextColor(RED);
    M5.Display.setTextSize(1);
    M5.Display.println("No data received");
    return;
  }
  
  // データ表示部分をクリア（Y=30から220まで）
  M5.Display.fillRect(0, 30, 320, 190, BLACK);
  
  int y = 30;
  
  // 加速度センサー
  if (sensorData.hasAccelerometer) {
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(CYAN);
    M5.Display.println("Accelerometer (m/s2):");
    y += 10;
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(WHITE);
    M5.Display.printf("X:%.2f Y:%.2f Z:%.2f", 
      sensorData.accelerometer.x, 
      sensorData.accelerometer.y, 
      sensorData.accelerometer.z);
    y += 15;
  }
  
  // ジャイロスコープ
  if (sensorData.hasGyroscope) {
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(CYAN);
    M5.Display.println("Gyroscope (rad/s):");
    y += 10;
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(WHITE);
    M5.Display.printf("X:%.2f Y:%.2f Z:%.2f", 
      sensorData.gyroscope.x, 
      sensorData.gyroscope.y, 
      sensorData.gyroscope.z);
    y += 15;
  }
  
  // 磁気センサー
  if (sensorData.hasMagnetometer) {
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(CYAN);
    M5.Display.println("Magnetometer (uT):");
    y += 10;
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(WHITE);
    M5.Display.printf("X:%.1f Y:%.1f Z:%.1f", 
      sensorData.magnetometer.x, 
      sensorData.magnetometer.y, 
      sensorData.magnetometer.z);
    y += 15;
  }
  
  // 重力センサー
  if (sensorData.hasGravity) {
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(CYAN);
    M5.Display.println("Gravity (m/s2):");
    y += 10;
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(WHITE);
    M5.Display.printf("X:%.2f Y:%.2f Z:%.2f", 
      sensorData.gravity.x, 
      sensorData.gravity.y, 
      sensorData.gravity.z);
    y += 15;
  }
  
  // 光センサー
  if (sensorData.hasLight && y < 200) {
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(CYAN);
    M5.Display.print("Light: ");
    M5.Display.setTextColor(WHITE);
    M5.Display.printf("%.1f lux", sensorData.light.lux);
    y += 15;
  }
  
  // 近接センサー
  if (sensorData.hasProximity && y < 200) {
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(CYAN);
    M5.Display.print("Proximity: ");
    M5.Display.setTextColor(WHITE);
    M5.Display.printf("%.1f cm", sensorData.proximity.distance);
    y += 15;
  }
  
  // GPS (画面スペースの都合上、緯度経度のみ)
  if (sensorData.hasGps && y < 200) {
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(CYAN);
    M5.Display.println("GPS:");
    y += 10;
    M5.Display.setCursor(0, y);
    M5.Display.setTextColor(WHITE);
    M5.Display.printf("%.4f, %.4f", 
      sensorData.gps.latitude, 
      sensorData.gps.longitude);
    y += 10;
    if (y < 200) {
      M5.Display.printf("Alt:%.1fm Spd:%.1fm/s", 
        sensorData.gps.altitude,
        sensorData.gps.speed);
      y += 10;
    }
  }
  
  // ボタンガイド
  M5.Display.setCursor(0, 225);
  M5.Display.setTextColor(GREEN);
  M5.Display.print("[A]Rescan [B]Disconnect");
}

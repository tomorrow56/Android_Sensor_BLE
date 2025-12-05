/*
 * M5Stack BLE Sensor Receiver with 3D Wireframe Cube Visualization
 * AndroidアプリからセンサーデータをBLEで受信してワイヤーフレームキューブで可視化
 * 
 * 機能:
 * - BLEデバイススキャン
 * - デバイス選択と接続
 * - サービス探索とキャラクタリスティック登録
 * - JSONセンサーデータの受信
 * - 3Dワイヤーフレームキューブのリアルタイム描画
 * - センサーデータに基づくキューブの回転表示
 * 
 * 使用ライブラリ:
 * - M5Unified (M5Stack表示)
 * - NimBLE-Arduino (Bluetooth Low Energy)
 * - ArduinoJson (JSONパース)
 * 
 * 画面更新周期: 5Hz (200ms間隔)
 */

#include <M5Unified.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <vector>
#include <cmath>

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
  uint8_t addressType;
};
std::vector<DeviceInfo> deviceList;
int selectedDevice = 0;

// センサーデータ構造体
struct SensorData {
  unsigned long timestamp;
  float accelX, accelY, accelZ;
  float gyroX, gyroY, gyroZ;
  float magX, magY, magZ;
  float gravX, gravY, gravZ;
  bool hasAccel, hasGyro, hasMag, hasGrav;
};

SensorData sensorData;
String lastError = "";
unsigned long lastDataReceived = 0;

// 3D回転角度
float pitch = 0.0f;  // X軸回転
float roll = 0.0f;   // Z軸回転
float yaw = 0.0f;    // Y軸回転

// スムーズな回転のための目標値と現在値
float targetPitch = 0.0f;
float targetRoll = 0.0f;
float targetYaw = 0.0f;
float currentPitch = 0.0f;
float currentRoll = 0.0f;
float currentYaw = 0.0f;

// 画面更新用タイマー
unsigned long lastDisplayUpdate = 0;
const unsigned long DISPLAY_UPDATE_INTERVAL = 200; // 200ms = 5Hz

// スキャンコールバック用の永続的なオブジェクト
class MyScanCallbacks;
MyScanCallbacks* scanCallbacks = nullptr;

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
bool inString = false;

// 通知受信コールバック
static void notifyCallback(
  NimBLERemoteCharacteristic* pBLERemoteCharacteristic,
  uint8_t* pData,
  size_t length,
  bool isNotify) {
  
  size_t actualLen = length;
  for (size_t i = 0; i < length; i++) {
    if (pData[i] == 0) {
      actualLen = i;
      break;
    }
  }
  
  if (actualLen == 0) return;
  
  unsigned long now = millis();
  if (now - lastNotifyTime > 300 && jsonBuffer.length() > 0) {
    Serial.println("Timeout, clearing incomplete buffer");
    jsonBuffer = "";
    braceCount = 0;
    inString = false;
  }
  lastNotifyTime = now;
  
  for (size_t i = 0; i < actualLen; i++) {
    char c = (char)pData[i];
    
    if (c == '\n' || c == '\r') continue;
    if (jsonBuffer.length() == 0 && c != '{') continue;
    
    jsonBuffer += c;
    
    if (c == '"' && (jsonBuffer.length() < 2 || jsonBuffer.charAt(jsonBuffer.length() - 2) != '\\')) {
      inString = !inString;
    }
    
    if (!inString) {
      if (c == '{') {
        braceCount++;
      } else if (c == '}') {
        braceCount--;
        
        if (braceCount == 0 && jsonBuffer.length() > 10 && jsonBuffer.charAt(0) == '{') {
          JsonDocument doc;
          DeserializationError error = deserializeJson(doc, jsonBuffer);
          
          if (!error) {
            parseCompleteJson(doc);
          } else {
            parsePartialJson(jsonBuffer);
          }
          
          jsonBuffer = "";
          braceCount = 0;
          inString = false;
        }
      }
    }
  }
  
  if (jsonBuffer.length() > 2000) {
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
  
  if (doc["accelerometer"].is<JsonObject>()) {
    sensorData.accelX = doc["accelerometer"]["x"] | 0.0f;
    sensorData.accelY = doc["accelerometer"]["y"] | 0.0f;
    sensorData.accelZ = doc["accelerometer"]["z"] | 0.0f;
    sensorData.hasAccel = true;
  }
  
  if (doc["gravity"].is<JsonObject>()) {
    sensorData.gravX = doc["gravity"]["x"] | 0.0f;
    sensorData.gravY = doc["gravity"]["y"] | 0.0f;
    sensorData.gravZ = doc["gravity"]["z"] | 0.0f;
    sensorData.hasGrav = true;
  }
  
  if (doc["gyroscope"].is<JsonObject>()) {
    sensorData.gyroX = doc["gyroscope"]["x"] | 0.0f;
    sensorData.gyroY = doc["gyroscope"]["y"] | 0.0f;
    sensorData.gyroZ = doc["gyroscope"]["z"] | 0.0f;
    sensorData.hasGyro = true;
  }
  
  if (doc["magnetometer"].is<JsonObject>()) {
    sensorData.magX = doc["magnetometer"]["x"] | 0.0f;
    sensorData.magY = doc["magnetometer"]["y"] | 0.0f;
    sensorData.magZ = doc["magnetometer"]["z"] | 0.0f;
    sensorData.hasMag = true;
  }
  
  lastError = "";
}

// 文字列から数値を抽出するヘルパー関数
float extractFloat(const String& data, const String& key) {
  int idx = data.indexOf(key);
  if (idx == -1) return NAN;
  
  idx = data.indexOf(':', idx);
  if (idx == -1) return NAN;
  
  idx++;
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

// 部分的なJSONをパース
void parsePartialJson(const String& data) {
  bool updated = false;
  
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
}

// スキャンコールバッククラス (NimBLE 2.x API)
class MyScanCallbacks : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* advertisedDevice) override {
    if (currentState != STATE_SCANNING) return;
    
    String name = advertisedDevice->getName().c_str();
    String address = advertisedDevice->getAddress().toString().c_str();
    
    if (name.length() == 0) return;
    
    for (const auto& dev : deviceList) {
      if (dev.address == address) return;
    }
    
    DeviceInfo info;
    info.name = name;
    info.address = address;
    info.rssi = advertisedDevice->getRSSI();
    info.addressType = advertisedDevice->getAddress().getType();
    
    deviceList.push_back(info);
    
    Serial.print("Found device: ");
    Serial.print(name);
    Serial.print(" (");
    Serial.print(address);
    Serial.print(", RSSI: ");
    Serial.print(info.rssi);
    Serial.println(")");
  }
  
  void onScanEnd(const NimBLEScanResults& results, int reason) override {
    Serial.println("Scan complete");
    currentState = STATE_DEVICE_LIST;
  }
};

// BLEサーバーに接続
bool connectToServer(String address, uint8_t addressType) {
  Serial.println("Connecting to device...");
  currentState = STATE_CONNECTING;
  
  if (pClient == nullptr) {
    pClient = NimBLEDevice::createClient();
    pClient->setClientCallbacks(new MyClientCallback());
    pClient->setConnectionParams(12, 12, 0, 51);
    pClient->setConnectTimeout(10);
  }
  
  NimBLEAddress bleAddress(address.c_str(), addressType);
  Serial.print(" - BLE Address: ");
  Serial.print(bleAddress.toString().c_str());
  Serial.print(", type: ");
  Serial.println(addressType);
  
  Serial.println(" - Attempting to connect...");
  updateDisplay();
  
  if (!pClient->connect(bleAddress)) {
    Serial.println(" - Failed to connect");
    lastError = "Connection Failed";
    currentState = STATE_DEVICE_LIST;
    updateDisplay();
    return false;
  }
  Serial.println(" - Connected to server");
  
  uint16_t mtu = pClient->getMTU();
  Serial.print(" - MTU: ");
  Serial.println(mtu);
  
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
  
  if(pRemoteCharacteristic->canNotify()) {
    pRemoteCharacteristic->subscribe(true, notifyCallback);
    Serial.println(" - Subscribed to notifications");
  }
  
  connected = true;
  currentState = STATE_CONNECTED;
  lastError = "";
  updateDisplay();
  return true;
}

// BLEスキャン開始
void startScan() {
  Serial.println("Starting BLE scan...");
  currentState = STATE_SCANNING;
  deviceList.clear();
  selectedDevice = 0;
  
  if (scanCallbacks == nullptr) {
    scanCallbacks = new MyScanCallbacks();
  }
  
  NimBLEScan* pBLEScan = NimBLEDevice::getScan();
  pBLEScan->setScanCallbacks(scanCallbacks, false);
  pBLEScan->setActiveScan(true);
  pBLEScan->setMaxResults(0);
  
  Serial.println("Starting 10 second scan...");
  pBLEScan->start(10000, false, true);
  Serial.println("Scan started, waiting for callbacks...");
}

// センサーデータから回転角度を計算
void updateRotationFromSensor() {
  if (!sensorData.hasAccel || !sensorData.hasGyro) return;
  
  // 加速度センサーからpitchとrollを計算 (WebUI_Cubeと同じロジック)
  float ax = sensorData.accelX;
  float ay = sensorData.accelY;
  float az = sensorData.accelZ;
  
  targetPitch = atan2(ay, sqrt(ax * ax + az * az));
  targetRoll = atan2(-ax, sqrt(ay * ay + az * az));
  
  // ジャイロスコープのZ軸からyawを積分
  targetYaw += sensorData.gyroZ * 0.04f;
  
  // スムーズな補間 (WebUI_Cubeと同じ係数 0.1)
  currentPitch += (targetPitch - currentPitch) * 0.1f;
  currentRoll += (targetRoll - currentRoll) * 0.1f;
  currentYaw += (targetYaw - currentYaw) * 0.1f;
}

// 3D点を2Dに投影
struct Point2D {
  int x;
  int y;
};

struct Point3D {
  float x;
  float y;
  float z;
};

Point2D project3Dto2D(Point3D p, float distance = 200.0f) {
  // 回転行列を適用
  // Z軸回転 (roll)
  float cosRoll = cos(currentRoll);
  float sinRoll = sin(currentRoll);
  float x1 = p.x * cosRoll - p.y * sinRoll;
  float y1 = p.x * sinRoll + p.y * cosRoll;
  float z1 = p.z;
  
  // X軸回転 (pitch)
  float cosPitch = cos(currentPitch);
  float sinPitch = sin(currentPitch);
  float y2 = y1 * cosPitch - z1 * sinPitch;
  float z2 = y1 * sinPitch + z1 * cosPitch;
  float x2 = x1;
  
  // Y軸回転 (yaw)
  float cosYaw = cos(currentYaw);
  float sinYaw = sin(currentYaw);
  float x3 = x2 * cosYaw - z2 * sinYaw;
  float z3 = x2 * sinYaw + z2 * cosYaw;
  float y3 = y2;
  
  // 透視投影
  float scale = distance / (distance + z3);
  
  Point2D result;
  result.x = (int)(M5.Display.width() / 2 + x3 * scale);
  result.y = (int)(M5.Display.height() / 2 - y3 * scale);
  
  return result;
}

// ワイヤーフレームキューブを描画
void drawWireframeCube() {
  // キューブの8頂点を定義 (サイズ: 60x60x60)
  Point3D vertices[8] = {
    {-30, -30, -30},  // 0: 左下後
    { 30, -30, -30},  // 1: 右下後
    { 30,  30, -30},  // 2: 右上後
    {-30,  30, -30},  // 3: 左上後
    {-30, -30,  30},  // 4: 左下前
    { 30, -30,  30},  // 5: 右下前
    { 30,  30,  30},  // 6: 右上前
    {-30,  30,  30}   // 7: 左上前
  };
  
  // 3D頂点を2D投影
  Point2D projected[8];
  for (int i = 0; i < 8; i++) {
    projected[i] = project3Dto2D(vertices[i]);
  }
  
  // 12本のエッジを描画
  uint16_t color = GREEN;
  
  // 後面の4本
  M5.Display.drawLine(projected[0].x, projected[0].y, projected[1].x, projected[1].y, color);
  M5.Display.drawLine(projected[1].x, projected[1].y, projected[2].x, projected[2].y, color);
  M5.Display.drawLine(projected[2].x, projected[2].y, projected[3].x, projected[3].y, color);
  M5.Display.drawLine(projected[3].x, projected[3].y, projected[0].x, projected[0].y, color);
  
  // 前面の4本
  M5.Display.drawLine(projected[4].x, projected[4].y, projected[5].x, projected[5].y, color);
  M5.Display.drawLine(projected[5].x, projected[5].y, projected[6].x, projected[6].y, color);
  M5.Display.drawLine(projected[6].x, projected[6].y, projected[7].x, projected[7].y, color);
  M5.Display.drawLine(projected[7].x, projected[7].y, projected[4].x, projected[4].y, color);
  
  // 前後を結ぶ4本
  M5.Display.drawLine(projected[0].x, projected[0].y, projected[4].x, projected[4].y, color);
  M5.Display.drawLine(projected[1].x, projected[1].y, projected[5].x, projected[5].y, color);
  M5.Display.drawLine(projected[2].x, projected[2].y, projected[6].x, projected[6].y, color);
  M5.Display.drawLine(projected[3].x, projected[3].y, projected[7].x, projected[7].y, color);
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
        M5.Display.println("BtnC: Down");
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
      // ワイヤーフレームキューブを描画
      drawWireframeCube();
      
      // センサーデータを画面下部に表示
      M5.Display.setTextSize(1);
      M5.Display.setCursor(0, M5.Display.height() - 40);
      
      if (sensorData.hasAccel) {
        M5.Display.printf("Acc:%.1f,%.1f,%.1f\n", 
                         sensorData.accelX, sensorData.accelY, sensorData.accelZ);
      }
      
      if (sensorData.hasGyro) {
        M5.Display.printf("Gyr:%.1f,%.1f,%.1f\n", 
                         sensorData.gyroX, sensorData.gyroY, sensorData.gyroZ);
      }
      
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
    if (M5.BtnA.wasPressed()) {
      if (deviceList.size() > 0) {
        selectedDevice--;
        if (selectedDevice < 0) {
          selectedDevice = deviceList.size() - 1;
        }
        updateDisplay();
      }
    }
    
    if (M5.BtnB.wasPressed()) {
      if (deviceList.size() > 0) {
        Serial.print("Selected device: ");
        Serial.print(deviceList[selectedDevice].name);
        Serial.print(" (");
        Serial.print(deviceList[selectedDevice].address);
        Serial.println(")");
        connectToServer(deviceList[selectedDevice].address, deviceList[selectedDevice].addressType);
        updateDisplay();
      } else {
        startScan();
        updateDisplay();
      }
    }
    
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
    if (M5.BtnB.wasPressed()) {
      if (pClient != nullptr && connected) {
        pClient->disconnect();
      }
      connected = false;
      currentState = STATE_DEVICE_LIST;
      updateDisplay();
    }
  } else if (currentState == STATE_ERROR) {
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
  Serial.println("M5Stack BLE Sensor Receiver with 3D Cube Visualization");
  
  // NimBLE 初期化
  NimBLEDevice::init("");
  NimBLEDevice::setMTU(517);
  Serial.print("MTU set to: ");
  Serial.println(NimBLEDevice::getMTU());
  Serial.println("NimBLE initialized");
  
  // 最初のスキャン開始
  startScan();
  updateDisplay();
}

void loop() {
  M5.update();
  
  // 接続中は定期的にセンサーデータから回転を更新
  if (currentState == STATE_CONNECTED && connected) {
    updateRotationFromSensor();
    
    // 画面更新 (5Hz = 200ms間隔)
    unsigned long now = millis();
    if (now - lastDisplayUpdate >= DISPLAY_UPDATE_INTERVAL) {
      updateDisplay();
      lastDisplayUpdate = now;
    }
  } else {
    // その他の状態では500ms間隔で更新
    static unsigned long lastOtherUpdate = 0;
    if (millis() - lastOtherUpdate >= 500) {
      updateDisplay();
      lastOtherUpdate = millis();
    }
  }
  
  handleButtons();
  delay(50);
}

package com.example.sensorbluetoothserial

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.os.ParcelUuid
import java.util.UUID
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.gson.Gson
import java.util.Timer
import java.util.TimerTask

class BlePeripheralService : Service() {
    
    // BLE UUIDs
    private val SERVICE_UUID = UUID.fromString("0000180A-0000-1000-8000-00805F9B34FB") // Device Information Service (例として)
    private val CHARACTERISTIC_UUID = UUID.fromString("00002A57-0000-1000-8000-00805F9B34FB") // Sensor Location Characteristic (例として)
    private val CCC_DESCRIPTOR_UUID = UUID.fromString("00002902-0000-1000-8000-00805F9B34FB") // Client Characteristic Configuration Descriptor

    private lateinit var bluetoothManager: BluetoothManager
    private lateinit var bluetoothAdapter: BluetoothAdapter
    private var gattServer: BluetoothGattServer? = null
    private var sensorCharacteristic: BluetoothGattCharacteristic? = null
    private var connectedDevices = mutableSetOf<android.bluetooth.BluetoothDevice>()
    private var deviceMtuMap = mutableMapOf<String, Int>()  // デバイスごとのMTUを保存
    private val DEFAULT_MTU = 23  // BLE 4.0のデフォルトMTU
    private val ATT_HEADER_SIZE = 3  // ATTヘッダーサイズ

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.i(TAG, "BLE Advertising started successfully")
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "BLE Advertising failed: $errorCode")
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: android.bluetooth.BluetoothDevice?, status: Int, newState: Int) {
            super.onConnectionStateChange(device, status, newState)
            if (newState == android.bluetooth.BluetoothProfile.STATE_CONNECTED) {
                Log.i(TAG, "Device connected: ${device?.address}")
                device?.let { 
                    connectedDevices.add(it)
                    deviceMtuMap[it.address] = DEFAULT_MTU
                }
            } else if (newState == android.bluetooth.BluetoothProfile.STATE_DISCONNECTED) {
                Log.i(TAG, "Device disconnected: ${device?.address}")
                device?.let { 
                    connectedDevices.remove(it)
                    deviceMtuMap.remove(it.address)
                }
            }
        }
        
        override fun onMtuChanged(device: android.bluetooth.BluetoothDevice?, mtu: Int) {
            super.onMtuChanged(device, mtu)
            device?.let {
                deviceMtuMap[it.address] = mtu
                Log.i(TAG, "MTU changed for ${it.address}: $mtu")
            }
        }

        override fun onCharacteristicReadRequest(device: android.bluetooth.BluetoothDevice?, requestId: Int, offset: Int, characteristic: BluetoothGattCharacteristic?) {
            super.onCharacteristicReadRequest(device, requestId, offset, characteristic)
            if (characteristic?.uuid == CHARACTERISTIC_UUID) {
                // 読み取りリクエストには現在のデータを返す
                val data = getCurrentSensorData()
                val jsonData = gson.toJson(data)
                gattServer?.sendResponse(device, requestId, android.bluetooth.BluetoothGatt.GATT_SUCCESS, offset, jsonData.toByteArray())
            } else {
                gattServer?.sendResponse(device, requestId, android.bluetooth.BluetoothGatt.GATT_READ_NOT_PERMITTED, offset, null)
            }
        }

        override fun onDescriptorWriteRequest(device: android.bluetooth.BluetoothDevice?, requestId: Int, descriptor: BluetoothGattDescriptor?, preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray?) {
            super.onDescriptorWriteRequest(device, requestId, descriptor, preparedWrite, responseNeeded, offset, value)
            if (descriptor?.uuid == CCC_DESCRIPTOR_UUID) {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, android.bluetooth.BluetoothGatt.GATT_SUCCESS, offset, null)
                }
                val isEnabled = value?.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) ?: false
                Log.i(TAG, "Notification for ${device?.address} is now ${if (isEnabled) "enabled" else "disabled"}")
                // ここでNotificationの有効/無効を管理するフラグを設定することも可能だが、今回はシンプルに実装
            } else {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, android.bluetooth.BluetoothGatt.GATT_FAILURE, offset, null)
                }
            }
        }
    }
    
    private val binder = LocalBinder()
    private var sensorDataManager: SensorDataManager? = null
    private var timer: Timer? = null
    private val gson = Gson()
    private var isRunning = false
    private var samplingIntervalMs: Long = 100 // デフォルト100ms (10Hz)
    
    inner class LocalBinder : Binder() {
        fun getService(): BlePeripheralService = this@BlePeripheralService
    }
    
    override fun onCreate() {
        bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothAdapter = bluetoothManager.adapter
        
        setupGattServer()
        startAdvertising()
        
        super.onCreate()
        super.onCreate()
        Log.d(TAG, "Service onCreate")
        sensorDataManager = SensorDataManager(this)
        createNotificationChannel()
    }
    
    override fun onBind(intent: Intent?): IBinder {
        Log.d(TAG, "Service onBind")
        return binder
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service onStartCommand")
        try {
            startForeground(NOTIFICATION_ID, createNotification())
        } catch (e: Exception) {
            Log.e(TAG, "Error starting foreground service", e)
        }
        return START_STICKY
    }
    
    fun startDataCollection(samplingIntervalMs: Long) {
        if (isRunning) {
            Log.d(TAG, "Data collection already running")
            return
        }
        
        Log.d(TAG, "Starting data collection with interval: $samplingIntervalMs ms")
        this.samplingIntervalMs = samplingIntervalMs
        
        // センサーのサンプリングレートを設定
        val sensorDelay = when {
            samplingIntervalMs <= 20 -> android.hardware.SensorManager.SENSOR_DELAY_FASTEST
            samplingIntervalMs <= 50 -> android.hardware.SensorManager.SENSOR_DELAY_GAME
            samplingIntervalMs <= 200 -> android.hardware.SensorManager.SENSOR_DELAY_UI
            else -> android.hardware.SensorManager.SENSOR_DELAY_NORMAL
        }
        sensorDataManager?.samplingRateUs = sensorDelay
        
        try {
            sensorDataManager?.start()
            
            // タイマーでデータを定期的に送信
            timer = Timer()
            timer?.scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    sendSensorData()
                }
            }, 0, samplingIntervalMs)
            
            isRunning = true
            Log.d(TAG, "Data collection started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting data collection", e)
        }
    }
    
    fun stopDataCollection() {
        if (!isRunning) {
            Log.d(TAG, "Data collection not running")
            return
        }
        
        Log.d(TAG, "Stopping data collection")
        
        try {
            timer?.cancel()
            timer = null
            
            sensorDataManager?.stop()
            
            isRunning = false
            Log.d(TAG, "Data collection stopped successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping data collection", e)
        }
    }
    
    fun isCollecting(): Boolean = isRunning
    
    fun getCurrentSensorData(): SensorData? {
        return sensorDataManager?.getCurrentData()
    }
    
    private fun sendSensorData() {
        try {
            val data = sensorDataManager?.getCurrentData() ?: return
            val jsonData = gson.toJson(data)
            val jsonBytes = jsonData.toByteArray(Charsets.UTF_8)
            
            // BLEで送信（常に分割して送信 - BLE通知の信頼性のため）
            sensorCharacteristic?.let { characteristic ->
                connectedDevices.forEach { device ->
                    // 常に小さいチャンクで送信（MTUに関係なく244バイト以下）
                    val maxPayload = 244  // 安全なペイロードサイズ
                    
                    Log.d(TAG, "Device ${device.address}: dataSize=${jsonBytes.size}, maxPayload=$maxPayload")
                    
                    // 常に分割して送信
                    var offset = 0
                    var chunkNum = 0
                    while (offset < jsonBytes.size) {
                        val end = minOf(offset + maxPayload, jsonBytes.size)
                        val chunk = jsonBytes.copyOfRange(offset, end)
                        
                        characteristic.value = chunk
                        gattServer?.notifyCharacteristicChanged(device, characteristic, false)
                        Log.d(TAG, "Sent chunk $chunkNum: ${chunk.size} bytes (offset=$offset, isLast=${end >= jsonBytes.size})")
                        
                        offset = end
                        chunkNum++
                        
                        // チャンク間に少し待機（BLEスタックのバッファオーバーフロー防止）
                        if (offset < jsonBytes.size) {
                            Thread.sleep(30)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending sensor data", e)
        }
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Sensor Data Service",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "センサーデータ収集サービス"
                }
                
                val notificationManager = getSystemService(NotificationManager::class.java)
                notificationManager?.createNotificationChannel(channel)
                Log.d(TAG, "Notification channel created")
            } catch (e: Exception) {
                Log.e(TAG, "Error creating notification channel", e)
            }
        }
    }
    
    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("センサーデータ収集中")
            .setContentText("センサーデータを収集しています")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    private fun setupGattServer() {
        gattServer = bluetoothManager.openGattServer(this, gattServerCallback)
        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        
        sensorCharacteristic = BluetoothGattCharacteristic(
            CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        
        // Notificationを有効にするためのDescriptor
        val cccDescriptor = BluetoothGattDescriptor(
            CCC_DESCRIPTOR_UUID,
            BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
        )
        sensorCharacteristic?.addDescriptor(cccDescriptor)
        
        service.addCharacteristic(sensorCharacteristic)
        gattServer?.addService(service)
        Log.i(TAG, "GATT Server setup complete")
    }

    private fun startAdvertising() {
        val advertiser = bluetoothAdapter.bluetoothLeAdvertiser ?: run {
            Log.e(TAG, "Failed to get BLE advertiser")
            return
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        advertiser.startAdvertising(settings, data, advertiseCallback)
        Log.i(TAG, "Advertising started")
    }

    private fun stopAdvertising() {
        bluetoothAdapter.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
        Log.i(TAG, "Advertising stopped")
    }

    override fun onDestroy() {
        Log.d(TAG, "Service onDestroy")
        stopAdvertising()
        gattServer?.close()
        gattServer = null
        stopDataCollection()
        super.onDestroy()
    }
    
    companion object {
        private const val TAG = "BlePeripheralService"
        private const val CHANNEL_ID = "SensorDataServiceChannel"
        private const val NOTIFICATION_ID = 1
    }
}

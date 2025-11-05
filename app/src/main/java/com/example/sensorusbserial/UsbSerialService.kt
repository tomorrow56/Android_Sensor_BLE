package com.example.sensorusbserial

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.gson.Gson
import java.util.Timer
import java.util.TimerTask

class UsbSerialService : Service() {
    
    private val binder = LocalBinder()
    private var sensorDataManager: SensorDataManager? = null
    private var timer: Timer? = null
    private val gson = Gson()
    private var isRunning = false
    private var samplingIntervalMs: Long = 100 // デフォルト100ms (10Hz)
    
    inner class LocalBinder : Binder() {
        fun getService(): UsbSerialService = this@UsbSerialService
    }
    
    override fun onCreate() {
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
            
            // ADBログに出力
            Log.d("SensorData", jsonData)
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
    
    override fun onDestroy() {
        Log.d(TAG, "Service onDestroy")
        stopDataCollection()
        super.onDestroy()
    }
    
    companion object {
        private const val TAG = "UsbSerialService"
        private const val CHANNEL_ID = "SensorDataServiceChannel"
        private const val NOTIFICATION_ID = 1
    }
}

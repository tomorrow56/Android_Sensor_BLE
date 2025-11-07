package com.example.sensorbluetoothserial

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager as AndroidSensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import androidx.core.content.ContextCompat

class SensorDataManager(private val context: Context) : SensorEventListener, LocationListener {
    
    private val sensorManager: AndroidSensorManager = 
        context.getSystemService(Context.SENSOR_SERVICE) as AndroidSensorManager
    private val locationManager: LocationManager = 
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    
    private var accelerometerSensor: Sensor? = null
    private var gyroscopeSensor: Sensor? = null
    private var lightSensor: Sensor? = null
    
    private var currentAccelerometer: AccelerometerData? = null
    private var currentGyroscope: GyroscopeData? = null
    private var currentLight: LightData? = null
    private var currentGps: GpsData? = null
    
    var samplingRateUs: Int = AndroidSensorManager.SENSOR_DELAY_NORMAL
        set(value) {
            field = value
            if (isStarted) {
                stop()
                start()
            }
        }
    
    private var isStarted = false
    
    init {
        accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscopeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        lightSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT)
    }
    
    fun start() {
        if (isStarted) return
        
        accelerometerSensor?.let {
            sensorManager.registerListener(this, it, samplingRateUs)
        }
        
        gyroscopeSensor?.let {
            sensorManager.registerListener(this, it, samplingRateUs)
        }
        
        lightSensor?.let {
            sensorManager.registerListener(this, it, samplingRateUs)
        }
        
        try {
            if (ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.ACCESS_FINE_LOCATION
                ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    1000L, // 1秒ごと
                    0f,
                    this
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        
        isStarted = true
    }
    
    fun stop() {
        if (!isStarted) return
        
        sensorManager.unregisterListener(this)
        locationManager.removeUpdates(this)
        
        isStarted = false
    }
    
    fun getCurrentData(): SensorData {
        return SensorData(
            timestamp = System.currentTimeMillis(),
            accelerometer = currentAccelerometer,
            gyroscope = currentGyroscope,
            light = currentLight,
            gps = currentGps
        )
    }
    
    override fun onSensorChanged(event: SensorEvent?) {
        event?.let {
            when (it.sensor.type) {
                Sensor.TYPE_ACCELEROMETER -> {
                    currentAccelerometer = AccelerometerData(
                        x = it.values[0],
                        y = it.values[1],
                        z = it.values[2]
                    )
                }
                Sensor.TYPE_GYROSCOPE -> {
                    currentGyroscope = GyroscopeData(
                        x = it.values[0],
                        y = it.values[1],
                        z = it.values[2]
                    )
                }
                Sensor.TYPE_LIGHT -> {
                    currentLight = LightData(lux = it.values[0])
                }
            }
        }
    }
    
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // 精度変更時の処理（必要に応じて実装）
    }
    
    override fun onLocationChanged(location: Location) {
        currentGps = GpsData(
            latitude = location.latitude,
            longitude = location.longitude,
            altitude = location.altitude,
            accuracy = location.accuracy,
            speed = location.speed
        )
    }
    
    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {
        // 非推奨メソッド
    }
    
    override fun onProviderEnabled(provider: String) {
        // プロバイダ有効化時の処理
    }
    
    override fun onProviderDisabled(provider: String) {
        // プロバイダ無効化時の処理
    }
}

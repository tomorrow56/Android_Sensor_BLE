package com.example.sensorbluetoothserial

data class SensorData(
    val timestamp: Long,
    val accelerometer: AccelerometerData? = null,
    val gyroscope: GyroscopeData? = null,
    val light: LightData? = null,
    val gps: GpsData? = null
)

data class AccelerometerData(
    val x: Float,
    val y: Float,
    val z: Float
)

data class GyroscopeData(
    val x: Float,
    val y: Float,
    val z: Float
)

data class LightData(
    val lux: Float
)

data class GpsData(
    val latitude: Double,
    val longitude: Double,
    val altitude: Double,
    val accuracy: Float,
    val speed: Float
)

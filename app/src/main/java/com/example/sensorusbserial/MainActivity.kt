package com.example.sensorusbserial

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    
    private lateinit var statusText: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    private lateinit var samplingRateSpinner: Spinner
    private lateinit var accelerometerText: TextView
    private lateinit var gyroscopeText: TextView
    private lateinit var lightText: TextView
    private lateinit var gpsText: TextView
    
    private var usbSerialService: UsbSerialService? = null
    private var serviceBound = false
    
    private val handler = Handler(Looper.getMainLooper())
    private var updateRunnable: Runnable? = null
    
    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as UsbSerialService.LocalBinder
            usbSerialService = binder.getService()
            serviceBound = true
            updateUI()
        }
        
        override fun onServiceDisconnected(name: ComponentName?) {
            usbSerialService = null
            serviceBound = false
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        statusText = findViewById(R.id.statusText)
        startButton = findViewById(R.id.startButton)
        stopButton = findViewById(R.id.stopButton)
        samplingRateSpinner = findViewById(R.id.samplingRateSpinner)
        accelerometerText = findViewById(R.id.accelerometerText)
        gyroscopeText = findViewById(R.id.gyroscopeText)
        lightText = findViewById(R.id.lightText)
        gpsText = findViewById(R.id.gpsText)
        
        setupSamplingRateSpinner()
        setupButtons()
        checkPermissions()
    }
    
    override fun onStart() {
        super.onStart()
        // サービスにバインド
        val intent = Intent(this, UsbSerialService::class.java)
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }
    
    private fun setupSamplingRateSpinner() {
        val samplingRates = arrayOf(
            "1 Hz (1000ms)",
            "2 Hz (500ms)",
            "5 Hz (200ms)",
            "10 Hz (100ms)",
            "20 Hz (50ms)",
            "50 Hz (20ms)",
            "100 Hz (10ms)"
        )
        
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, samplingRates)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        samplingRateSpinner.adapter = adapter
        samplingRateSpinner.setSelection(3) // デフォルト10Hz
    }
    
    private fun setupButtons() {
        startButton.setOnClickListener {
            if (checkPermissions()) {
                startDataCollection()
            } else {
                Toast.makeText(this, "必要な権限が許可されていません", Toast.LENGTH_SHORT).show()
            }
        }
        
        stopButton.setOnClickListener {
            stopDataCollection()
        }
    }
    
    private fun startDataCollection() {
        if (!serviceBound) {
            Toast.makeText(this, "サービスが準備できていません", Toast.LENGTH_SHORT).show()
            return
        }
        
        val samplingIntervalMs = when (samplingRateSpinner.selectedItemPosition) {
            0 -> 1000L  // 1 Hz
            1 -> 500L   // 2 Hz
            2 -> 200L   // 5 Hz
            3 -> 100L   // 10 Hz
            4 -> 50L    // 20 Hz
            5 -> 20L    // 50 Hz
            6 -> 10L    // 100 Hz
            else -> 100L
        }
        
        // サービスを開始
        val intent = Intent(this, UsbSerialService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        
        // データ収集を開始
        usbSerialService?.startDataCollection(samplingIntervalMs)
        
        // UI更新を開始
        startUIUpdate()
        
        updateUI()
        Toast.makeText(this, "データ収集を開始しました", Toast.LENGTH_SHORT).show()
    }
    
    private fun stopDataCollection() {
        usbSerialService?.stopDataCollection()
        
        // サービスを停止
        val intent = Intent(this, UsbSerialService::class.java)
        stopService(intent)
        
        // UI更新を停止
        stopUIUpdate()
        
        updateUI()
        Toast.makeText(this, "データ収集を停止しました", Toast.LENGTH_SHORT).show()
    }
    
    private fun startUIUpdate() {
        updateRunnable = object : Runnable {
            override fun run() {
                updateSensorDisplay()
                handler.postDelayed(this, 100) // 100msごとに更新
            }
        }
        handler.post(updateRunnable!!)
    }
    
    private fun stopUIUpdate() {
        updateRunnable?.let {
            handler.removeCallbacks(it)
        }
        updateRunnable = null
        
        // データ表示をリセット
        accelerometerText.text = "X: --\nY: --\nZ: --"
        gyroscopeText.text = "X: --\nY: --\nZ: --"
        lightText.text = "照度: --"
        gpsText.text = "緯度: --\n経度: --\n高度: --\n精度: --\n速度: --"
    }
    
    private fun updateSensorDisplay() {
        val data = usbSerialService?.getCurrentSensorData() ?: return
        
        // 加速度センサー
        data.accelerometer?.let { accel ->
            accelerometerText.text = String.format(
                "X: %.3f\nY: %.3f\nZ: %.3f",
                accel.x, accel.y, accel.z
            )
        }
        
        // ジャイロスコープ
        data.gyroscope?.let { gyro ->
            gyroscopeText.text = String.format(
                "X: %.3f\nY: %.3f\nZ: %.3f",
                gyro.x, gyro.y, gyro.z
            )
        }
        
        // 光センサー
        data.light?.let { light ->
            lightText.text = String.format("照度: %.1f", light.lux)
        }
        
        // GPS
        data.gps?.let { gps ->
            gpsText.text = String.format(
                "緯度: %.6f\n経度: %.6f\n高度: %.1f m\n精度: %.1f m\n速度: %.1f m/s",
                gps.latitude, gps.longitude, gps.altitude, gps.accuracy, gps.speed
            )
        }
    }
    
    private fun updateUI() {
        val isCollecting = usbSerialService?.isCollecting() ?: false
        
        startButton.isEnabled = !isCollecting
        stopButton.isEnabled = isCollecting
        samplingRateSpinner.isEnabled = !isCollecting
        
        statusText.text = if (isCollecting) {
            "データ収集中"
        } else {
            "停止中"
        }
    }
    
    private fun checkPermissions(): Boolean {
        val permissionsToRequest = mutableListOf<String>()
        
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        
        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                PERMISSION_REQUEST_CODE
            )
            return false
        }
        
        return true
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == PERMISSION_REQUEST_CODE) {
            val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            if (allGranted) {
                Toast.makeText(this, "権限が許可されました", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(
                    this,
                    "一部の権限が許可されませんでした。GPS機能が制限される可能性があります。",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
    
    override fun onStop() {
        super.onStop()
        stopUIUpdate()
        if (serviceBound) {
            unbindService(serviceConnection)
            serviceBound = false
        }
    }
    
    companion object {
        private const val PERMISSION_REQUEST_CODE = 1001
    }
}

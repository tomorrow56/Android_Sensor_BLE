class BluetoothSensorReceiver {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        this.isConnected = false;
        this.isReceiving = false;
        this.sensorData = [];
        this.connectionStartTime = null;
        this.connectionTimer = null;
        
        // AndroidアプリのBLE UUID設定
        this.SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
        this.CHARACTERISTIC_UUID = '00002a57-0000-1000-8000-00805f9b34fb';
        this.CCC_DESCRIPTOR_UUID = '00002902-0000-1000-8000-00805f9b34fb';
        
        this.initializeElements();
        this.bindEvents();
        this.addLog('Web Bluetoothセンサーレシーバーを初期化しました', 'info');
    }
    
    initializeElements() {
        this.elements = {
            connectBtn: document.getElementById('connectBtn'),
            disconnectBtn: document.getElementById('disconnectBtn'),
            startBtn: document.getElementById('startBtn'),
            stopBtn: document.getElementById('stopBtn'),
            exportBtn: document.getElementById('exportBtn'),
            clearBtn: document.getElementById('clearBtn'),
            connectionStatus: document.getElementById('connectionStatus'),
            dataCount: document.getElementById('dataCount'),
            connectionTime: document.getElementById('connectionTime'),
            lastUpdate: document.getElementById('lastUpdate'),
            log: document.getElementById('log'),
            
            // センサーデータ表示要素
            accelX: document.getElementById('accelX'),
            accelY: document.getElementById('accelY'),
            accelZ: document.getElementById('accelZ'),
            gyroX: document.getElementById('gyroX'),
            gyroY: document.getElementById('gyroY'),
            gyroZ: document.getElementById('gyroZ'),
            light: document.getElementById('light'),
            gpsLat: document.getElementById('gpsLat'),
            gpsLng: document.getElementById('gpsLng'),
            gpsAlt: document.getElementById('gpsAlt'),
            gpsAcc: document.getElementById('gpsAcc'),
            gpsSpeed: document.getElementById('gpsSpeed'),
            magnetX: document.getElementById('magnetX'),
            magnetY: document.getElementById('magnetY'),
            magnetZ: document.getElementById('magnetZ'),
            proximity: document.getElementById('proximity'),
            gravityX: document.getElementById('gravityX'),
            gravityY: document.getElementById('gravityY'),
            gravityZ: document.getElementById('gravityZ')
        };
    }
    
    bindEvents() {
        this.elements.connectBtn.addEventListener('click', () => this.connect());
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.elements.startBtn.addEventListener('click', () => this.startReceiving());
        this.elements.stopBtn.addEventListener('click', () => this.stopReceiving());
        this.elements.exportBtn.addEventListener('click', () => this.exportToCSV());
        this.elements.clearBtn.addEventListener('click', () => this.clearData());
    }
    
    async connect() {
        try {
            this.updateConnectionStatus('connecting', '🔄 接続中...');
            this.addLog('Bluetoothデバイスの接続を開始します', 'info');
            
            // Web Bluetooth APIでデバイスを要求
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{
                    services: [this.SERVICE_UUID]
                }],
                optionalServices: [this.SERVICE_UUID]
            });
            
            this.addLog(`デバイスが見つかりました: ${this.device.name || 'Unknown'}`, 'success');
            
            // デバイス接続イベント
            this.device.addEventListener('gattserverdisconnected', () => {
                this.onDisconnected();
            });
            
            // GATTサーバーに接続
            this.server = await this.device.gatt.connect();
            this.addLog('GATTサーバーに接続しました', 'success');
            
            // サービスを取得
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            this.addLog('サービスを取得しました', 'success');
            
            // キャラクタリスティックを取得
            this.characteristic = await this.service.getCharacteristic(this.CHARACTERISTIC_UUID);
            this.addLog('キャラクタリスティックを取得しました', 'success');
            
            this.isConnected = true;
            this.updateConnectionStatus('connected', '✅ 接続済み');
            this.updateButtonStates();
            this.startConnectionTimer();
            
            this.addLog('Bluetoothデバイスへの接続が完了しました', 'success');
            
        } catch (error) {
            this.addLog(`接続エラー: ${error.message}`, 'error');
            this.updateConnectionStatus('disconnected', '📡 未接続');
            console.error('Bluetooth connection error:', error);
        }
    }
    
    async disconnect() {
        try {
            if (this.isReceiving) {
                await this.stopReceiving();
            }
            
            if (this.device && this.device.gatt.connected) {
                await this.device.gatt.disconnect();
            }
            
            this.onDisconnected();
            this.addLog('Bluetoothデバイスから切断しました', 'info');
            
        } catch (error) {
            this.addLog(`切断エラー: ${error.message}`, 'error');
            console.error('Bluetooth disconnection error:', error);
        }
    }
    
    onDisconnected() {
        this.isConnected = false;
        this.isReceiving = false;
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        
        this.updateConnectionStatus('disconnected', '📡 未接続');
        this.updateButtonStates();
        this.stopConnectionTimer();
        
        this.addLog('Bluetoothデバイスが切断されました', 'info');
    }
    
    async startReceiving() {
        try {
            if (!this.characteristic) {
                throw new Error('キャラクタリスティックが利用できません');
            }
            
            this.addLog('センサーデータの受信を開始します', 'info');
            
            // Notificationを開始
            await this.characteristic.startNotifications();
            
            // データ受信イベント
            this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.onSensorDataReceived(event);
            });
            
            this.isReceiving = true;
            this.updateButtonStates();
            this.addLog('センサーデータの受信を開始しました', 'success');
            
        } catch (error) {
            this.addLog(`データ受信開始エラー: ${error.message}`, 'error');
            console.error('Start receiving error:', error);
        }
    }
    
    async stopReceiving() {
        try {
            if (this.characteristic) {
                await this.characteristic.stopNotifications();
            }
            
            this.isReceiving = false;
            this.updateButtonStates();
            this.addLog('センサーデータの受信を停止しました', 'info');
            
        } catch (error) {
            this.addLog(`データ受信停止エラー: ${error.message}`, 'error');
            console.error('Stop receiving error:', error);
        }
    }
    
    onSensorDataReceived(event) {
        try {
            const value = event.target.value;
            const jsonData = new TextDecoder('utf-8').decode(value);
            const sensorData = JSON.parse(jsonData);
            
            // データを保存
            sensorData.receivedAt = new Date().toISOString();
            this.sensorData.push(sensorData);
            
            // UIを更新
            this.updateSensorDisplay(sensorData);
            this.updateStatistics();
            
            this.addLog(`センサーデータを受信: ${JSON.stringify(sensorData).substring(0, 100)}...`, 'data');
            
        } catch (error) {
            this.addLog(`データ解析エラー: ${error.message}`, 'error');
            console.error('Sensor data parsing error:', error);
        }
    }
    
    updateSensorDisplay(data) {
        // 加速度センサー
        if (data.accelerometer) {
            this.elements.accelX.textContent = data.accelerometer.x?.toFixed(3) || '--';
            this.elements.accelY.textContent = data.accelerometer.y?.toFixed(3) || '--';
            this.elements.accelZ.textContent = data.accelerometer.z?.toFixed(3) || '--';
        }
        
        // ジャイロスコープ
        if (data.gyroscope) {
            this.elements.gyroX.textContent = data.gyroscope.x?.toFixed(4) || '--';
            this.elements.gyroY.textContent = data.gyroscope.y?.toFixed(4) || '--';
            this.elements.gyroZ.textContent = data.gyroscope.z?.toFixed(4) || '--';
        }
        
        // 光センサー
        if (data.light) {
            this.elements.light.textContent = data.light.lux?.toFixed(1) || '--';
        }
        
        // GPS
        if (data.gps) {
            this.elements.gpsLat.textContent = data.gps.latitude?.toFixed(6) || '--';
            this.elements.gpsLng.textContent = data.gps.longitude?.toFixed(6) || '--';
            this.elements.gpsAlt.textContent = data.gps.altitude?.toFixed(1) || '--';
            this.elements.gpsAcc.textContent = data.gps.accuracy?.toFixed(1) || '--';
            this.elements.gpsSpeed.textContent = data.gps.speed?.toFixed(2) || '--';
        }
        
        // 磁気センサー
        if (data.magnetometer) {
            this.elements.magnetX.textContent = data.magnetometer.x?.toFixed(3) || '--';
            this.elements.magnetY.textContent = data.magnetometer.y?.toFixed(3) || '--';
            this.elements.magnetZ.textContent = data.magnetometer.z?.toFixed(3) || '--';
        }
        
        // 近接センサー
        if (data.proximity) {
            this.elements.proximity.textContent = data.proximity.distance?.toFixed(1) || '--';
        }
        
        // 重力センサー
        if (data.gravity) {
            this.elements.gravityX.textContent = data.gravity.x?.toFixed(3) || '--';
            this.elements.gravityY.textContent = data.gravity.y?.toFixed(3) || '--';
            this.elements.gravityZ.textContent = data.gravity.z?.toFixed(3) || '--';
        }
    }
    
    updateStatistics() {
        this.elements.dataCount.textContent = this.sensorData.length;
        this.elements.lastUpdate.textContent = new Date().toLocaleTimeString('ja-JP');
    }
    
    startConnectionTimer() {
        this.connectionStartTime = Date.now();
        this.connectionTimer = setInterval(() => {
            const elapsed = Date.now() - this.connectionStartTime;
            const hours = Math.floor(elapsed / 3600000);
            const minutes = Math.floor((elapsed % 3600000) / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            
            this.elements.connectionTime.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    stopConnectionTimer() {
        if (this.connectionTimer) {
            clearInterval(this.connectionTimer);
            this.connectionTimer = null;
        }
        this.elements.connectionTime.textContent = '--:--:--';
    }
    
    updateConnectionStatus(status, text) {
        this.elements.connectionStatus.className = `connection-status ${status}`;
        this.elements.connectionStatus.textContent = text;
    }
    
    updateButtonStates() {
        this.elements.connectBtn.disabled = this.isConnected;
        this.elements.disconnectBtn.disabled = !this.isConnected;
        this.elements.startBtn.disabled = !this.isConnected || this.isReceiving;
        this.elements.stopBtn.disabled = !this.isReceiving;
        this.elements.exportBtn.disabled = this.sensorData.length === 0;
    }
    
    exportToCSV() {
        try {
            if (this.sensorData.length === 0) {
                this.addLog('エクスポートするデータがありません', 'error');
                return;
            }
            
            const headers = [
                'Timestamp', 'Accel X', 'Accel Y', 'Accel Z', 
                'Gyro X', 'Gyro Y', 'Gyro Z', 'Light', 
                'GPS Lat', 'GPS Lng', 'GPS Alt', 'GPS Acc', 'GPS Speed',
                'Magnet X', 'Magnet Y', 'Magnet Z',
                'Proximity', 'Gravity X', 'Gravity Y', 'Gravity Z'
            ];
            const rows = this.sensorData.map(data => [
                data.timestamp || '',
                data.accelerometer?.x || '',
                data.accelerometer?.y || '',
                data.accelerometer?.z || '',
                data.gyroscope?.x || '',
                data.gyroscope?.y || '',
                data.gyroscope?.z || '',
                data.light?.lux || '',
                data.gps?.latitude || '',
                data.gps?.longitude || '',
                data.gps?.altitude || '',
                data.gps?.accuracy || '',
                data.gps?.speed || '',
                data.magnetometer?.x || '',
                data.magnetometer?.y || '',
                data.magnetometer?.z || '',
                data.proximity?.distance || '',
                data.gravity?.x || '',
                data.gravity?.y || '',
                data.gravity?.z || ''
            ]);
            
            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${cell}"`).join(','))
                .join('\n');
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `sensor_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.addLog(`${this.sensorData.length}件のデータをCSVファイルとしてエクスポートしました`, 'success');
            
        } catch (error) {
            this.addLog(`CSVエクスポートエラー: ${error.message}`, 'error');
            console.error('CSV export error:', error);
        }
    }
    
    clearData() {
        this.sensorData = [];
        this.updateStatistics();
        this.updateButtonStates();
        
        // センサーデータ表示をリセット
        ['accelX', 'accelY', 'accelZ', 'gyroX', 'gyroY', 'gyroZ', 'light', 
         'gpsLat', 'gpsLng', 'gpsAlt', 'gpsAcc', 'gpsSpeed',
         'magnetX', 'magnetY', 'magnetZ', 'proximity',
         'gravityX', 'gravityY', 'gravityZ'].forEach(id => {
            this.elements[id].textContent = '--';
        });
        
        this.addLog('センサーデータをクリアしました', 'info');
    }
    
    addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('ja-JP');
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.elements.log.appendChild(logEntry);
        this.elements.log.scrollTop = this.elements.log.scrollHeight;
        
        // ログエントリ数を制限
        while (this.elements.log.children.length > 100) {
            this.elements.log.removeChild(this.elements.log.firstChild);
        }
    }
}

// Web Bluetooth APIのサポートをチェック
if (!navigator.bluetooth) {
    document.addEventListener('DOMContentLoaded', () => {
        const logElement = document.getElementById('log');
        const errorEntry = document.createElement('div');
        errorEntry.className = 'log-entry error';
        errorEntry.textContent = '[ERROR] このブラウザはWeb Bluetooth APIをサポートしていません。Chrome、Edge、Operaを使用してください。';
        logElement.appendChild(errorEntry);
        
        document.getElementById('connectBtn').disabled = true;
    });
} else {
    // アプリケーションを初期化
    document.addEventListener('DOMContentLoaded', () => {
        window.bluetoothReceiver = new BluetoothSensorReceiver();
    });
}
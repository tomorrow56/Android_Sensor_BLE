// Bluetooth UUIDs
const SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '00002a57-0000-1000-8000-00805f9b34fb';

// Three.js setup
let scene, camera, renderer, cube;
let targetRotation = new THREE.Euler(0, 0, 0);
let currentRotation = new THREE.Euler(0, 0, 0);

// Bluetooth variables
let device = null;
let server = null;
let characteristic = null;
let isConnected = false;
let isReceiving = false;

// Initialize Three.js
function initThreeJS() {
    const canvas = document.getElementById('canvas3d');
    const container = canvas.parentElement;
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    
    // Camera
    camera = new THREE.PerspectiveCamera(
        50,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(-10, -10, -5);
    scene.add(pointLight);
    
    // Create cube with different colored faces
    const materials = [
        new THREE.MeshStandardMaterial({ color: 0xef4444 }), // Right - Red
        new THREE.MeshStandardMaterial({ color: 0x3b82f6 }), // Left - Blue
        new THREE.MeshStandardMaterial({ color: 0x22c55e }), // Top - Green
        new THREE.MeshStandardMaterial({ color: 0xeab308 }), // Bottom - Yellow
        new THREE.MeshStandardMaterial({ color: 0x8b5cf6 }), // Front - Purple
        new THREE.MeshStandardMaterial({ color: 0xf97316 }), // Back - Orange
    ];
    
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    cube = new THREE.Mesh(geometry, materials);
    scene.add(cube);
    
    // Grid
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    scene.add(gridHelper);
    
    // Mouse controls
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let cameraRotation = { x: 0, y: 0 };
    let cameraDistance = 8.66;
    
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            cameraRotation.y += deltaX * 0.005;
            cameraRotation.x += deltaY * 0.005;
            
            cameraRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotation.x));
            
            updateCameraPosition();
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });
    
    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        cameraDistance += e.deltaY * 0.01;
        cameraDistance = Math.max(3, Math.min(20, cameraDistance));
        updateCameraPosition();
    });
    
    function updateCameraPosition() {
        camera.position.x = cameraDistance * Math.sin(cameraRotation.y) * Math.cos(cameraRotation.x);
        camera.position.y = cameraDistance * Math.sin(cameraRotation.x);
        camera.position.z = cameraDistance * Math.cos(cameraRotation.y) * Math.cos(cameraRotation.x);
        camera.lookAt(0, 0, 0);
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        
        // Smooth rotation interpolation
        currentRotation.x += (targetRotation.x - currentRotation.x) * 0.1;
        currentRotation.y += (targetRotation.y - currentRotation.y) * 0.1;
        currentRotation.z += (targetRotation.z - currentRotation.z) * 0.1;
        
        cube.rotation.copy(currentRotation);
        
        renderer.render(scene, camera);
    }
    
    animate();
}

// Update sensor data display
function updateSensorDisplay(data) {
    document.getElementById('accelX').textContent = data.accelerometer.x.toFixed(2);
    document.getElementById('accelY').textContent = data.accelerometer.y.toFixed(2);
    document.getElementById('accelZ').textContent = data.accelerometer.z.toFixed(2);
    
    document.getElementById('gyroX').textContent = data.gyroscope.x.toFixed(2);
    document.getElementById('gyroY').textContent = data.gyroscope.y.toFixed(2);
    document.getElementById('gyroZ').textContent = data.gyroscope.z.toFixed(2);
}

// Update cube rotation from sensor data
function updateCubeRotation(data) {
    const { accelerometer, gyroscope } = data;
    
    // Calculate pitch and roll from accelerometer
    const pitch = Math.atan2(accelerometer.y, Math.sqrt(accelerometer.x ** 2 + accelerometer.z ** 2));
    const roll = Math.atan2(-accelerometer.x, Math.sqrt(accelerometer.y ** 2 + accelerometer.z ** 2));
    
    targetRotation.x = pitch;
    targetRotation.z = roll;
    
    // Integrate gyroscope data for yaw
    targetRotation.y += gyroscope.z * 0.01;
}

// Bluetooth connection
async function connectBluetooth() {
    try {
        if (!navigator.bluetooth) {
            alert('このブラウザはWeb Bluetooth APIをサポートしていません');
            return;
        }
        
        device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SERVICE_UUID] }],
            optionalServices: [SERVICE_UUID]
        });
        
        device.addEventListener('gattserverdisconnected', onDisconnected);
        
        server = await device.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
        
        isConnected = true;
        updateConnectionUI();
        
        document.getElementById('deviceName').textContent = `デバイス: ${device.name || 'Unknown'}`;
        
    } catch (error) {
        console.error('Connection error:', error);
        alert('接続に失敗しました: ' + error.message);
    }
}

// Disconnect Bluetooth
async function disconnectBluetooth() {
    try {
        if (isReceiving) {
            await stopReceiving();
        }
        
        if (server && server.connected) {
            server.disconnect();
        }
        
        isConnected = false;
        device = null;
        server = null;
        characteristic = null;
        
        updateConnectionUI();
        document.getElementById('deviceName').textContent = '';
        
    } catch (error) {
        console.error('Disconnect error:', error);
    }
}

// Handle disconnection
function onDisconnected() {
    isConnected = false;
    isReceiving = false;
    updateConnectionUI();
    document.getElementById('deviceName').textContent = '';
}

// Start receiving data
async function startReceiving() {
    try {
        if (!characteristic) {
            alert('デバイスが接続されていません');
            return;
        }
        
        characteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
        await characteristic.startNotifications();
        
        isReceiving = true;
        updateConnectionUI();
        
    } catch (error) {
        console.error('Start receiving error:', error);
        alert('データ受信の開始に失敗しました: ' + error.message);
    }
}

// Stop receiving data
async function stopReceiving() {
    try {
        if (!characteristic) return;
        
        await characteristic.stopNotifications();
        characteristic.removeEventListener('characteristicvaluechanged', handleDataReceived);
        
        isReceiving = false;
        updateConnectionUI();
        
    } catch (error) {
        console.error('Stop receiving error:', error);
    }
}

// Handle received data
function handleDataReceived(event) {
    try {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        const jsonString = decoder.decode(value);
        const data = JSON.parse(jsonString);
        
        updateSensorDisplay(data);
        updateCubeRotation(data);
        
    } catch (error) {
        console.error('Data parsing error:', error);
    }
}

// Update UI based on connection state
function updateConnectionUI() {
    const statusBadge = document.getElementById('statusBadge');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    if (isConnected) {
        statusBadge.textContent = '接続済み';
        statusBadge.className = 'status-badge connected';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        startBtn.disabled = false;
    } else {
        statusBadge.textContent = '未接続';
        statusBadge.className = 'status-badge disconnected';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        startBtn.disabled = true;
        stopBtn.disabled = true;
    }
    
    if (isReceiving) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        startBtn.disabled = !isConnected;
        stopBtn.disabled = true;
    }
}

// Event listeners
document.getElementById('connectBtn').addEventListener('click', connectBluetooth);
document.getElementById('disconnectBtn').addEventListener('click', disconnectBluetooth);
document.getElementById('startBtn').addEventListener('click', startReceiving);
document.getElementById('stopBtn').addEventListener('click', stopReceiving);

// Initialize
initThreeJS();
updateConnectionUI();

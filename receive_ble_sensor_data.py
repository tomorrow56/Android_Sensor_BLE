#!/usr/bin/env python3
"""
Sensor BLE - PC側データ受信スクリプト (macOS)

このスクリプトは、bleakライブラリを使用してAndroidデバイスから
BLE経由でセンサーデータをリアルタイムで受信し、処理します。

使用方法:
    pip install bleak
    python3 receive_ble_sensor_data.py

機能:
    - BLEデバイスのスキャン
    - センサーデータサービスの検索と接続
    - リアルタイムでセンサーデータを受信 (Notification)
    - JSONデータのパース
    - CSVファイルへの保存
    - コンソールへの表示
"""

import asyncio
import json
import csv
import sys
from datetime import datetime
from typing import Optional, Dict, Any

from bleak import BleakClient, BleakScanner
from bleak.exc import BleakError

# Androidアプリで定義したUUID
SERVICE_UUID = "0000180A-0000-1000-8000-00805F9B34FB"
CHARACTERISTIC_UUID = "00002A57-0000-1000-8000-00805F9B34FB"

class SensorDataReceiverBLE:
    """BLEセンサーデータ受信クラス"""

    def __init__(self, output_csv: str = "sensor_data_ble.csv"):
        self.output_csv = output_csv
        self.csv_file = None
        self.csv_writer = None
        self.data_count = 0
        self.client: Optional[BleakClient] = None

    def initialize_csv(self):
        """CSVファイルを初期化"""
        try:
            self.csv_file = open(self.output_csv, 'w', newline='', encoding='utf-8')
            self.csv_writer = csv.writer(self.csv_file)
            self.csv_writer.writerow([
                'timestamp', 'datetime',
                'accel_x', 'accel_y', 'accel_z',
                'gyro_x', 'gyro_y', 'gyro_z',
                'light_lux',
                'gps_lat', 'gps_lon', 'gps_alt', 'gps_accuracy', 'gps_speed',
                'magnet_x', 'magnet_y', 'magnet_z',
                'proximity_distance',
                'gravity_x', 'gravity_y', 'gravity_z'
            ])
            print(f"✓ CSVファイルを作成しました: {self.output_csv}")
        except Exception as e:
            print(f"✗ CSVファイル作成エラー: {e}")
            sys.exit(1)

    def notification_handler(self, sender: int, data: bytearray):
        """Notification受信時のコールバック"""
        try:
            json_str = data.decode('utf-8')
            sensor_data = json.loads(json_str)
            self.save_to_csv(sensor_data)
            self.display_data(sensor_data)
        except UnicodeDecodeError:
            print(f"✗ 受信データのデコードに失敗しました: {data}")
        except json.JSONDecodeError:
            print(f"✗ JSONのパースに失敗しました: {json_str}")
        except Exception as e:
            print(f"✗ データ処理中にエラーが発生しました: {e}")

    def save_to_csv(self, data: Dict[str, Any]):
        """データをCSVに保存"""
        try:
            timestamp = data.get('timestamp', 0)
            dt = datetime.fromtimestamp(timestamp / 1000.0)

            accel = data.get('accelerometer', {})
            gyro = data.get('gyroscope', {})
            light = data.get('light', {})
            gps = data.get('gps', {})
            magnetometer = data.get('magnetometer', {})
            proximity = data.get('proximity', {})
            gravity = data.get('gravity', {})

            self.csv_writer.writerow([
                timestamp,
                dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                accel.get('x', ''), accel.get('y', ''), accel.get('z', ''),
                gyro.get('x', ''), gyro.get('y', ''), gyro.get('z', ''),
                light.get('lux', ''),
                gps.get('latitude', ''), gps.get('longitude', ''), gps.get('altitude', ''),
                gps.get('accuracy', ''), gps.get('speed', ''),
                magnetometer.get('x', ''), magnetometer.get('y', ''), magnetometer.get('z', ''),
                proximity.get('distance', ''),
                gravity.get('x', ''), gravity.get('y', ''), gravity.get('z', '')
            ])
            self.csv_file.flush()
        except Exception as e:
            print(f"CSV書き込みエラー: {e}")

    def display_data(self, data: Dict[str, Any]):
        """データをコンソールに表示"""
        self.data_count += 1
        dt = datetime.fromtimestamp(data.get('timestamp', 0) / 1000.0)
        print(f"\n--- データ #{self.data_count} ({dt.strftime('%H:%M:%S.%f')[:-3]}) ---")
        
        if 'accelerometer' in data and data['accelerometer']:
            accel = data['accelerometer']
            print(f"加速度: X={accel['x']:.3f}, Y={accel['y']:.3f}, Z={accel['z']:.3f} m/s²")
        
        if 'gyroscope' in data and data['gyroscope']:
            gyro = data['gyroscope']
            print(f"ジャイロ: X={gyro['x']:.3f}, Y={gyro['y']:.3f}, Z={gyro['z']:.3f} rad/s")
        
        if 'light' in data and data['light']:
            print(f"光: {data['light']['lux']:.1f} lux")
        
        if 'gps' in data and data['gps']:
            gps = data['gps']
            print(f"GPS: 緯度={gps['latitude']:.6f}, 経度={gps['longitude']:.6f}, 高度={gps['altitude']:.1f}m")
        
        if 'magnetometer' in data and data['magnetometer']:
            magnet = data['magnetometer']
            print(f"磁気: X={magnet['x']:.3f}, Y={magnet['y']:.3f}, Z={magnet['z']:.3f} μT")
        
        if 'proximity' in data and data['proximity']:
            print(f"近接: {data['proximity']['distance']:.1f} cm")
        
        if 'gravity' in data and data['gravity']:
            gravity = data['gravity']
            print(f"重力: X={gravity['x']:.3f}, Y={gravity['y']:.3f}, Z={gravity['z']:.3f} m/s²")

    async def run(self):
        print("\n" + "="*60)
        print("Sensor BLE - データ受信スクリプト")
        print("="*60)

        self.initialize_csv()

        print("\nBLEデバイスをスキャンしています...")
        try:
            device = await BleakScanner.find_device_by_filter(
                lambda d, ad: SERVICE_UUID.lower() in [s.lower() for s in ad.service_uuids]
            )

            if device is None:
                print(f"✗ センサーデバイスが見つかりませんでした (サービスUUID: {SERVICE_UUID})")
                print("  Androidアプリがアドバタイズを開始しているか確認してください。")
                return

            print(f"✓ デバイスが見つかりました: {device.name} ({device.address})")

            async with BleakClient(device) as client:
                self.client = client
                print(f"✓ デバイスに接続しました: {client.is_connected}")

                print(f"\nNotificationの購読を開始します (キャラクタリスティック: {CHARACTERISTIC_UUID})")
                await client.start_notify(CHARACTERISTIC_UUID, self.notification_handler)

                print("\nデータ受信を開始します...")
                print("終了するには Ctrl+C を押してください")
                while True:
                    await asyncio.sleep(1)

        except BleakError as e:
            print(f"✗ BLEエラーが発生しました: {e}")
        except Exception as e:
            print(f"✗ 予期せぬエラーが発生しました: {e}")
        finally:
            if self.client and self.client.is_connected:
                try:
                    await self.client.stop_notify(CHARACTERISTIC_UUID)
                    await self.client.disconnect()
                    print("\n✓ デバイスから切断しました")
                except BleakError as e:
                    print(f"✗ 切断中にエラーが発生しました: {e}")
            if self.csv_file:
                self.csv_file.close()
            print(f"\nデータ受信を停止しました。受信データ数: {self.data_count}")
            print(f"保存先: {self.output_csv}")

async def main():
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_csv = f"sensor_data_ble_{timestamp}.csv"
    receiver = SensorDataReceiverBLE(output_csv)
    try:
        await receiver.run()
    except asyncio.CancelledError:
        print("\nプログラムがキャンセルされました")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nプログラムを終了します")

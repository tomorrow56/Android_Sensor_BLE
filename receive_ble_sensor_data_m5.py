#!/usr/bin/env python3
"""
Sensor BLE - PC側データ受信スクリプト (macOS) - M5Stack対応版

このスクリプトは、bleakライブラリを使用してAndroidデバイス（app_for_m5）から
BLE経由でセンサーデータをリアルタイムで受信し、処理します。

app_for_m5版の特徴:
    - MTU対応のデータ分割送信に対応
    - 終端マーカー（改行）による完了検出
    - ブレースカウントによるJSON完了検出
    - タイムアウト処理（300ms）

使用方法:
    pip install bleak
    python3 receive_ble_sensor_data_m5.py

機能:
    - BLEデバイスのスキャン
    - センサーデータサービスの検索と接続
    - 分割送信されたデータの再構築
    - リアルタイムでセンサーデータを受信 (Notification)
    - JSONデータのパース
    - CSVファイルへの保存
    - コンソールへの表示
"""

import asyncio
import json
import csv
import sys
import time
from datetime import datetime
from typing import Optional, Dict, Any

from bleak import BleakClient, BleakScanner
from bleak.exc import BleakError

# Androidアプリで定義したUUID
SERVICE_UUID = "0000180A-0000-1000-8000-00805F9B34FB"
CHARACTERISTIC_UUID = "00002A57-0000-1000-8000-00805F9B34FB"

# M5版用の設定
BUFFER_TIMEOUT_MS = 300  # バッファタイムアウト（ミリ秒）
MAX_BUFFER_SIZE = 2000   # 最大バッファサイズ


class SensorDataReceiverBLE:
    """BLEセンサーデータ受信クラス（M5Stack対応版）"""

    def __init__(self, output_csv: str = "sensor_data_ble_m5.csv"):
        self.output_csv = output_csv
        self.csv_file = None
        self.csv_writer = None
        self.data_count = 0
        self.client: Optional[BleakClient] = None
        
        # M5版用のバッファ管理
        self.json_buffer = ""
        self.last_notify_time = 0.0
        self.brace_count = 0
        self.in_string = False

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

    def clear_buffer(self):
        """バッファをクリア"""
        self.json_buffer = ""
        self.brace_count = 0
        self.in_string = False

    def process_complete_json(self, json_str: str):
        """完全なJSONデータを処理"""
        try:
            sensor_data = json.loads(json_str)
            self.save_to_csv(sensor_data)
            self.display_data(sensor_data)
        except json.JSONDecodeError as e:
            print(f"✗ JSONのパースに失敗しました: {e}")

    def notification_handler(self, sender: int, data: bytearray):
        """Notification受信時のコールバック（M5版分割データ対応）"""
        try:
            # NULL終端を除去
            actual_data = data
            for i, byte in enumerate(data):
                if byte == 0:
                    actual_data = data[:i]
                    break
            
            if len(actual_data) == 0:
                return
            
            current_time = time.time() * 1000  # ミリ秒
            
            # タイムアウトチェック
            if (current_time - self.last_notify_time > BUFFER_TIMEOUT_MS and 
                len(self.json_buffer) > 0):
                print("タイムアウト: 不完全なバッファをクリア")
                self.clear_buffer()
            
            self.last_notify_time = current_time
            
            # 受信データを文字列に変換
            chunk = actual_data.decode('utf-8')
            
            # 文字ごとに処理
            for c in chunk:
                # 改行・キャリッジリターンはスキップ
                if c == '\n' or c == '\r':
                    continue
                
                # バッファが空で'{'以外はスキップ
                if len(self.json_buffer) == 0 and c != '{':
                    continue
                
                self.json_buffer += c
                
                # 文字列内かどうかを追跡（エスケープされていない引用符）
                if c == '"':
                    # 前の文字がバックスラッシュでない場合
                    if len(self.json_buffer) < 2 or self.json_buffer[-2] != '\\':
                        self.in_string = not self.in_string
                
                # 文字列外でのブレースカウント
                if not self.in_string:
                    if c == '{':
                        self.brace_count += 1
                    elif c == '}':
                        self.brace_count -= 1
                        
                        # JSON完了チェック
                        if (self.brace_count == 0 and 
                            len(self.json_buffer) > 10 and 
                            self.json_buffer[0] == '{'):
                            self.process_complete_json(self.json_buffer)
                            self.clear_buffer()
            
            # バッファサイズ制限
            if len(self.json_buffer) > MAX_BUFFER_SIZE:
                print(f"警告: バッファサイズ超過 ({len(self.json_buffer)} bytes)、クリア")
                self.clear_buffer()
                
        except UnicodeDecodeError:
            print(f"✗ 受信データのデコードに失敗しました: {data}")
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
        print("Sensor BLE - データ受信スクリプト (M5Stack対応版)")
        print("="*60)
        print("分割送信対応: 有効")
        print(f"バッファタイムアウト: {BUFFER_TIMEOUT_MS}ms")
        print(f"最大バッファサイズ: {MAX_BUFFER_SIZE} bytes")

        self.initialize_csv()

        print("\nBLEデバイスをスキャンしています...")
        try:
            device = await BleakScanner.find_device_by_filter(
                lambda d, ad: SERVICE_UUID.lower() in [s.lower() for s in ad.service_uuids]
            )

            if device is None:
                print(f"✗ センサーデバイスが見つかりませんでした (サービスUUID: {SERVICE_UUID})")
                print("  app_for_m5 アプリがアドバタイズを開始しているか確認してください。")
                return

            print(f"✓ デバイスが見つかりました: {device.name} ({device.address})")

            async with BleakClient(device) as client:
                self.client = client
                print(f"✓ デバイスに接続しました: {client.is_connected}")
                
                # MTU情報を表示（可能であれば）
                try:
                    mtu = client.mtu_size
                    print(f"✓ MTUサイズ: {mtu} bytes")
                except AttributeError:
                    print("  MTUサイズ: 取得不可")

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
    output_csv = f"sensor_data_ble_m5_{timestamp}.csv"
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

#!/usr/bin/env python3
"""
Sensor USB Serial - PC側データ受信スクリプト

このスクリプトは、adb logcatを使用してAndroidデバイスから
センサーデータをリアルタイムで受信し、処理します。

使用方法:
    python3 receive_sensor_data.py

機能:
    - リアルタイムでセンサーデータを受信
    - JSONデータのパース
    - CSVファイルへの保存
    - コンソールへの表示
"""

import subprocess
import json
import csv
import sys
import os
from datetime import datetime
from typing import Optional, Dict, Any

class SensorDataReceiver:
    """センサーデータ受信クラス"""
    
    def __init__(self, output_csv: str = "sensor_data.csv"):
        """
        初期化
        
        Args:
            output_csv: 出力するCSVファイル名
        """
        self.output_csv = output_csv
        self.csv_file = None
        self.csv_writer = None
        self.data_count = 0
        
    def check_adb_connection(self) -> bool:
        """
        ADB接続を確認
        
        Returns:
            接続されている場合True
        """
        try:
            result = subprocess.run(
                ["adb", "devices"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1 and "device" in lines[1]:
                print("✓ Androidデバイスが接続されています")
                return True
            else:
                print("✗ Androidデバイスが見つかりません")
                print("  USBデバッグが有効になっているか確認してください")
                return False
                
        except FileNotFoundError:
            print("✗ ADBコマンドが見つかりません")
            print("  Android SDK Platform Toolsをインストールしてください")
            return False
        except Exception as e:
            print(f"✗ ADB接続確認エラー: {e}")
            return False
    
    def initialize_csv(self):
        """CSVファイルを初期化"""
        try:
            self.csv_file = open(self.output_csv, 'w', newline='', encoding='utf-8')
            self.csv_writer = csv.writer(self.csv_file)
            
            # ヘッダー行を書き込み
            self.csv_writer.writerow([
                'timestamp',
                'datetime',
                'accel_x', 'accel_y', 'accel_z',
                'gyro_x', 'gyro_y', 'gyro_z',
                'light_lux',
                'gps_lat', 'gps_lon', 'gps_alt', 'gps_accuracy', 'gps_speed'
            ])
            
            print(f"✓ CSVファイルを作成しました: {self.output_csv}")
            
        except Exception as e:
            print(f"✗ CSVファイル作成エラー: {e}")
            sys.exit(1)
    
    def parse_sensor_data(self, json_str: str) -> Optional[Dict[str, Any]]:
        """
        JSONデータをパース
        
        Args:
            json_str: JSON文字列
            
        Returns:
            パースされたデータ、エラーの場合None
        """
        try:
            data = json.loads(json_str)
            return data
        except json.JSONDecodeError:
            return None
    
    def save_to_csv(self, data: Dict[str, Any]):
        """
        データをCSVに保存
        
        Args:
            data: センサーデータ
        """
        try:
            timestamp = data.get('timestamp', 0)
            dt = datetime.fromtimestamp(timestamp / 1000.0)
            
            # 加速度センサー
            accel = data.get('accelerometer', {})
            accel_x = accel.get('x', '') if accel else ''
            accel_y = accel.get('y', '') if accel else ''
            accel_z = accel.get('z', '') if accel else ''
            
            # ジャイロスコープ
            gyro = data.get('gyroscope', {})
            gyro_x = gyro.get('x', '') if gyro else ''
            gyro_y = gyro.get('y', '') if gyro else ''
            gyro_z = gyro.get('z', '') if gyro else ''
            
            # 光センサー
            light = data.get('light', {})
            light_lux = light.get('lux', '') if light else ''
            
            # GPS
            gps = data.get('gps', {})
            gps_lat = gps.get('latitude', '') if gps else ''
            gps_lon = gps.get('longitude', '') if gps else ''
            gps_alt = gps.get('altitude', '') if gps else ''
            gps_accuracy = gps.get('accuracy', '') if gps else ''
            gps_speed = gps.get('speed', '') if gps else ''
            
            # CSVに書き込み
            self.csv_writer.writerow([
                timestamp,
                dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                accel_x, accel_y, accel_z,
                gyro_x, gyro_y, gyro_z,
                light_lux,
                gps_lat, gps_lon, gps_alt, gps_accuracy, gps_speed
            ])
            
            self.csv_file.flush()
            
        except Exception as e:
            print(f"CSV書き込みエラー: {e}")
    
    def display_data(self, data: Dict[str, Any]):
        """
        データをコンソールに表示
        
        Args:
            data: センサーデータ
        """
        self.data_count += 1
        
        timestamp = data.get('timestamp', 0)
        dt = datetime.fromtimestamp(timestamp / 1000.0)
        
        print(f"\n--- データ #{self.data_count} ({dt.strftime('%H:%M:%S.%f')[:-3]}) ---")
        
        # 加速度センサー
        accel = data.get('accelerometer')
        if accel:
            print(f"加速度: X={accel['x']:.3f}, Y={accel['y']:.3f}, Z={accel['z']:.3f} m/s²")
        
        # ジャイロスコープ
        gyro = data.get('gyroscope')
        if gyro:
            print(f"ジャイロ: X={gyro['x']:.3f}, Y={gyro['y']:.3f}, Z={gyro['z']:.3f} rad/s")
        
        # 光センサー
        light = data.get('light')
        if light:
            print(f"光: {light['lux']:.1f} lux")
        
        # GPS
        gps = data.get('gps')
        if gps:
            print(f"GPS: 緯度={gps['latitude']:.6f}, 経度={gps['longitude']:.6f}, 高度={gps['altitude']:.1f}m")
            print(f"     精度={gps['accuracy']:.1f}m, 速度={gps['speed']:.1f}m/s")
    
    def start_receiving(self):
        """データ受信を開始"""
        
        print("\n" + "="*60)
        print("Sensor USB Serial - データ受信スクリプト")
        print("="*60)
        
        # ADB接続確認
        if not self.check_adb_connection():
            sys.exit(1)
        
        # CSV初期化
        self.initialize_csv()
        
        print("\nデータ受信を開始します...")
        print("終了するには Ctrl+C を押してください\n")
        
        try:
            # adb logcatを起動
            process = subprocess.Popen(
                ["adb", "logcat", "-s", "SensorData"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            
            # データを受信
            for line in process.stdout:
                line = line.strip()
                
                # ログ行から JSON部分を抽出
                if "SensorData" in line and "{" in line:
                    # JSON部分を抽出
                    json_start = line.find('{')
                    json_str = line[json_start:]
                    
                    # JSONをパース
                    data = self.parse_sensor_data(json_str)
                    
                    if data:
                        # CSVに保存
                        self.save_to_csv(data)
                        
                        # コンソールに表示
                        self.display_data(data)
                        
        except KeyboardInterrupt:
            print("\n\nデータ受信を停止しました")
            print(f"受信データ数: {self.data_count}")
            print(f"保存先: {self.output_csv}")
            
        except Exception as e:
            print(f"\nエラーが発生しました: {e}")
            
        finally:
            if self.csv_file:
                self.csv_file.close()
            
            if 'process' in locals():
                process.terminate()


def main():
    """メイン関数"""
    
    # 出力ファイル名を生成（タイムスタンプ付き）
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_csv = f"sensor_data_{timestamp}.csv"
    
    # データ受信開始
    receiver = SensorDataReceiver(output_csv)
    receiver.start_receiving()


if __name__ == "__main__":
    main()

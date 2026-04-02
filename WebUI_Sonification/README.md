# Sensor Sonification — Minimalist Data Visualization

Web Bluetooth API + Canvas 2D + Web Audio API を使用して、Android BLE センサーデータを**波形**と**音**でリアルタイムに可視化するWebアプリケーションです。

## デプロイURL

> [https://android-sensor-ble.vercel.app/sonification/](https://web-ui-sonification-i85vafbyv-tomorrow56s-projects.vercel.app/)

## 主な機能

- **4チャンネル波形表示**: 加速度・ジャイロ・磁気・重力センサーの X/Y/Z 軸をリアルタイム描画
- **IMU ベクトルレーダー**: 3センサーの合成ベクトルを極座標で可視化
- **スカラーゲージ**: 光センサー・近接センサー・GPS速度・高度をバーで表示
- **音響スペクトラム**: センサー値をスペクトラムバーとして可視化
- **Web Audio 音響合成**: センサー値をリアルタイムに音のパラメータへマッピング
  - 加速度強度 → ドローン音のピッチ・音量
  - ジャイロ強度 → シマー音のピッチ
  - 光センサー → 高音のピッチ
  - ジャイロZ → ローパスフィルターのカットオフ
- **デモモード**: BLEデバイスなしでも動作確認可能

## 必要な環境

- Chrome / Edge (Web Bluetooth API 対応ブラウザ)
- HTTPS 環境または localhost
- Android Sensor BLE アプリ

## ローカル実行

```bash
cd WebUI_Sonification
python -m http.server 8000
# → http://localhost:8000 にアクセス
```

# IoT-to-Web: Local-Only ESP32 IoT Platform MVP

**IoT-to-Web** is a 100% local, zero-cloud IoT platform enabling real ESP32 microcontrollers to communicate over local Wi-Fi / Router / Phone Hotspot networks with a Node.js/Express server and PostgreSQL database, monitored and controlled via a Next.js web dashboard in real time.

---

## 🏗️ Architecture Overview

```
                                +-----------------------------+
                                |      Physical ESP32         |
                                |  (or ESP32 Web Simulator)   |
                                +--------------+--------------+
                                               |
                                     Wi-Fi HTTP REST API
                                               |
                                               v
+-----------------------------------------------------------------------------------------------+
| Laptop / Local Server (Bound to 0.0.0.0:4000)                                                 |
|                                                                                               |
|   +---------------------------------------------------------------------------------------+   |
|   | Express Backend (TypeScript)                                                          |   |
|   |   - Device Auth & Hardware Config Endpoint                                            |   |
|   |   - Sensor Telemetry Receiver & Parser                                                |   |
|   |   - Command Queue & ACK Handler                                                       |   |
|   |   - Local IPv4 Auto-Discovery Module                                                  |   |
|   |   - Real-Time Automation Engine (IF condition THEN actuate)                            |   |
|   |   - Socket.IO Real-Time Server                                                        |   |
|   |   - Extensible AI Copilot Abstraction                                                 |   |
|   +--------------------------+------------------------------------+-----------------------+   |
|                              |                                    |                           |
|                              v                                    v                           |
|                   +--------------------+                +-------------------+                 |
|                   | PostgreSQL / DB    |                | Next.js Dashboard |                 |
|                   | (Tables: devices,   |                | (Tailwind CSS,    |                 |
|                   |  components,       |                |  Socket.IO Client,|                 |
|                   |  sensor_readings,  |                |  Recharts,        |                 |
|                   |  automation_rules, |                |  Firmware Generator|                |
|                   |  device_commands,  |                |  ESP32 Simulator) |                 |
|                   |  device_events)    |                +-------------------+                 |
|                   +--------------------+                                                      |
+-----------------------------------------------------------------------------------------------+
```

---

## 🔌 Hardware Wiring Diagram (Demo Physical Setup)

| Component | Category | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- | :--- |
| **DHT11** | Input | **GPIO 4** | Temperature & Humidity Sensor Signal Pin |
| **PIR Sensor** | Input | **GPIO 5** | Motion Detection Digital Signal Pin |
| **Status LED** | Output | **GPIO 18** | Status Indicator LED (Cathode to GND via 220Ω resistor) |
| **Buzzer** | Output | **GPIO 19** | Audio Alarm Output Pin |
| **Servo Motor** | Output | **GPIO 21** | PWM Angle Signal Control Pin |
| **LDR Sensor** | Input | **GPIO 34** | Light Sensor Analog Signal Pin |
| **HC-SR04** | Input | **Trig 12 / Echo 13** | Ultrasonic Distance Sensor Pins |
| **Push Button**| Input | **GPIO 27** | Digital Input Button (Internal Pullup) |

---

## 📚 Required Arduino Libraries

In Arduino IDE, install the following libraries via **Tools → Manage Libraries**:
1. `ArduinoJson` (by Benoit Blanchon) v6.x or v7.x
2. `DHT sensor library` (by Adafruit)
3. `Adafruit Unified Sensor`
4. `ESP32Servo` (by Kevin Harrington - optional for servo motor)

---

## ⚡ Quick Start Guide

### Step 1: Start PostgreSQL (Optional Docker or Local Service)
```bash
# Option A: Start using Docker Compose
docker-compose up -d

# Note: The backend includes an automatic fallback data store engine if PostgreSQL is not active!
```

### Step 2: Start Express Backend Server
```bash
cd backend
npm install
npm run dev
```
The backend binds to `0.0.0.0:4000` and displays your laptop's local LAN IPv4 address (e.g. `http://192.168.1.100:4000`).

### Step 3: Start Next.js Web Dashboard
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 4: Flash ESP32 or Launch Web Simulator
- **Web Simulator**: Navigate to `http://localhost:3000/simulator` to test telemetry and automations immediately.
- **Physical ESP32**:
  1. Open `/devices` in the dashboard and click **+ Add Device**.
  2. Copy the generated **Device ID** and **Device Token**.
  3. Go to `/devices/[id]/firmware` to download your customized `.ino` sketch pre-filled with your LAN IP and credentials.
  4. Flash the `.ino` file to your physical ESP32 using Arduino IDE.

---

## 🤖 Real-Time Automation Engine Flow

1. User creates automation rule:
   - **IF**: Motion (`PIR`) = `DETECTED`
   - **THEN**: `LED` = `1` (ON)
2. ESP32 detects motion and posts sensor reading to `POST /api/device/ESP32-A7F92/data`.
3. Backend Automation Engine evaluates the rule, generates a pending command for `GPIO 18`, and stores it in PostgreSQL.
4. ESP32 polls `GET /api/device/ESP32-A7F92/commands` every 1 second, receives the command, and sets GPIO 18 `HIGH`.
5. ESP32 sends ACK to `POST /api/device/ESP32-A7F92/commands/:id/ack`.
6. Dashboard updates LED status to `ON` in real time via Socket.IO.

---

## 🛡️ Windows Firewall & Local Network Troubleshooting

If your ESP32 cannot reach the laptop server (`http://192.168.1.x:4000`):

1. **Allow Port 4000 Through Windows Firewall**:
   Run PowerShell as Administrator:
   ```powershell
   New-NetFirewallRule -DisplayName "IoT-to-Web Server Port 4000" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
   ```

2. **Verify LAN Network**:
   - Both your laptop and ESP32 MUST be connected to the **SAME Wi-Fi router** or **Phone Wi-Fi Hotspot**.
   - Do NOT use `localhost` inside your ESP32 C++ firmware; use the explicit IP (e.g. `192.168.1.100`).

---

## 📁 Directory Structure

```
/iot-to-web
    /frontend             # Next.js App Router, Tailwind CSS, Socket.IO Client, Recharts
    /backend              # Express, TypeScript, Socket.IO, PostgreSQL, Network IP Auto-Discovery
    /esp32-firmware       # Production C++ Arduino Firmware (.ino sketch)
    /esp32-simulator      # CLI & Interactive Web ESP32 Hardware Simulator
    /database             # PostgreSQL SQL Migration Schema
    docker-compose.yml    # Docker setup for PostgreSQL database
    README.md             # Project Setup & Guide
```

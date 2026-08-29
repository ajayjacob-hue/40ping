'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileCode2, Download, Copy, Check, ArrowLeft, Wifi, Server, Key, ShieldCheck, Cpu } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, Device, Component } from '@/lib/api';

export default function FirmwareGeneratorPage() {
  const params = useParams();
  const deviceId = params.id as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [serverIp, setServerIp] = useState<string>('192.168.1.100');
  const [serverPort, setServerPort] = useState<number>(4000);

  const [wifiSsid, setWifiSsid] = useState<string>('YOUR_WIFI_SSID');
  const [wifiPassword, setWifiPassword] = useState<string>('YOUR_WIFI_PASSWORD');

  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const devRes = await axios.get(`${getBackendUrl()}/api/devices/${deviceId}`);
        setDevice(devRes.data.device);
        setComponents(devRes.data.components || []);
        if (devRes.data.serverIp) setServerIp(devRes.data.serverIp);
        if (devRes.data.serverPort) setServerPort(devRes.data.serverPort);
      } catch (err) {
        console.error('Failed to load device for firmware generator:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [deviceId]);

  const generateFirmwareCode = () => {
    const token = device?.token || 'YOUR_DEVICE_TOKEN_HERE';

    const hasDht = components.some((c) => c.type === 'DHT11');
    const hasUltrasonic = components.some((c) => c.type === 'HC-SR04');
    const hasPir = components.some((c) => c.type === 'PIR');
    const hasLdr = components.some((c) => c.type === 'LDR');
    const hasLed = components.some((c) => c.type === 'LED');
    const hasBuzzer = components.some((c) => c.type === 'BUZZER');
    const hasButton = components.some((c) => c.type === 'PUSH_BUTTON');

    const dhtComp = components.find((c) => c.type === 'DHT11');
    const ultraComp = components.find((c) => c.type === 'HC-SR04');
    const pirComp = components.find((c) => c.type === 'PIR');
    const ldrComp = components.find((c) => c.type === 'LDR');
    const ledComp = components.find((c) => c.type === 'LED');
    const buzzerComp = components.find((c) => c.type === 'BUZZER');
    const buttonComp = components.find((c) => c.type === 'PUSH_BUTTON');

    // Build Header Includes
    let includes = `#include <WiFi.h>\n#include <HTTPClient.h>\n#include <ArduinoJson.h>`;
    if (hasDht) includes += `\n#include <DHT.h>`;

    // Build Pin Definitions
    let pinDefs = `// Hardware GPIO Pin Definitions (Configured via Web Dashboard)\n`;
    if (hasDht) pinDefs += `#define DHTPIN ${dhtComp?.gpio_pin ?? 4}\n#define DHTTYPE DHT11\n`;
    if (hasUltrasonic) {
      const trigPin = ultraComp?.gpio_pin ?? 12;
      const echoPin = ultraComp?.gpio_secondary !== -1 ? ultraComp?.gpio_secondary : 13;
      pinDefs += `#define TRIG_PIN ${trigPin}\n#define ECHO_PIN ${echoPin}\n`;
    }
    if (hasPir) pinDefs += `#define PIR_PIN ${pirComp?.gpio_pin ?? 5}\n`;
    if (hasLdr) pinDefs += `#define LDR_PIN ${ldrComp?.gpio_pin ?? 34}\n`;
    if (hasLed) pinDefs += `#define LED_PIN ${ledComp?.gpio_pin ?? 18}\n`;
    if (hasBuzzer) pinDefs += `#define BUZZER_PIN ${buzzerComp?.gpio_pin ?? 19}\n`;
    if (hasButton) pinDefs += `#define BUTTON_PIN ${buttonComp?.gpio_pin ?? 27}\n`;

    // Sensor Object Inits
    let sensorInitGlobal = ``;
    if (hasDht) sensorInitGlobal += `DHT dht(DHTPIN, DHTTYPE);\n`;

    // Setup Code
    let setupCode = ``;
    if (hasLed) setupCode += `  pinMode(LED_PIN, OUTPUT);\n  digitalWrite(LED_PIN, LOW);\n`;
    if (hasBuzzer) setupCode += `  pinMode(BUZZER_PIN, OUTPUT);\n  digitalWrite(BUZZER_PIN, LOW);\n`;
    if (hasUltrasonic) setupCode += `  pinMode(TRIG_PIN, OUTPUT);\n  pinMode(ECHO_PIN, INPUT);\n`;
    if (hasPir) setupCode += `  pinMode(PIR_PIN, INPUT);\n`;
    if (hasButton) setupCode += `  pinMode(BUTTON_PIN, INPUT_PULLUP);\n`;
    if (hasDht) setupCode += `  dht.begin();\n`;

    // Reading Sensors Code
    let telemetryReadCode = `  StaticJsonDocument<256> doc;\n`;

    if (hasDht) {
      telemetryReadCode += `  float temp = dht.readTemperature();\n  float hum = dht.readHumidity();\n  if (isnan(temp)) temp = 25.0;\n  if (isnan(hum)) hum = 50.0;\n  doc["temperature"] = temp;\n  doc["humidity"] = hum;\n`;
    }

    if (hasUltrasonic) {
      telemetryReadCode += `  digitalWrite(TRIG_PIN, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG_PIN, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(TRIG_PIN, LOW);\n  long duration = pulseIn(ECHO_PIN, HIGH, 25000);\n  float distanceCm = (duration > 0) ? (duration * 0.034 / 2.0) : 100.0;\n  doc["distance"] = distanceCm;\n`;
    }

    if (hasPir) {
      telemetryReadCode += `  doc["motion"] = (digitalRead(PIR_PIN) == HIGH);\n`;
    }

    if (hasLdr) {
      telemetryReadCode += `  doc["light"] = analogRead(LDR_PIN);\n`;
    }

    if (hasButton) {
      telemetryReadCode += `  doc["button"] = (digitalRead(BUTTON_PIN) == LOW ? 1 : 0);\n`;
    }

    return `/*
 * IoT-to-Web Auto-Generated ESP32 Arduino Sketch
 * Device Name: ${device?.name || 'Smart Room'}
 * Device ID:   ${deviceId}
 * Configured Components: ${components.map((c) => c.type).join(', ') || 'Default'}
 * Generated:   ${new Date().toLocaleString()}
 */

${includes}

// Wi-Fi Credentials
const char* WIFI_SSID     = "${wifiSsid}";
const char* WIFI_PASSWORD = "${wifiPassword}";

// Local Laptop Server Configuration (DO NOT USE "localhost")
const char* SERVER_IP     = "${serverIp}";
const int   SERVER_PORT   = ${serverPort};

// Device Credentials
const char* DEVICE_ID     = "${deviceId}";
const char* DEVICE_TOKEN  = "${token}";

${pinDefs}
${sensorInitGlobal}
String serverBaseUrl;
unsigned long lastTelemetryTime = 0;
unsigned long lastCommandPollTime = 0;
unsigned long lastHeartbeatTime = 0;

void setup() {
  Serial.begin(115200);
${setupCode}
  serverBaseUrl = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/device/" + String(DEVICE_ID);

  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  unsigned long currentMillis = millis();

  // Poll Pending Commands Every 100ms for fast responsiveness
  if (currentMillis - lastCommandPollTime >= 100) {
    lastCommandPollTime = currentMillis;
    pollCommands();
  }

  // Send Telemetry Every 2 Seconds
  if (currentMillis - lastTelemetryTime >= 2000) {
    lastTelemetryTime = currentMillis;
    sendTelemetry();
  }

  // Send Heartbeat Every 10 Seconds
  if (currentMillis - lastHeartbeatTime >= 10000) {
    lastHeartbeatTime = currentMillis;
    sendHeartbeat();
  }

  delay(10);
}

void connectWiFi() {
  Serial.print("Connecting to "); Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500); Serial.print("."); attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\\n✅ Connected! ESP32 IP: " + WiFi.localIP().toString());
    sendHeartbeat();
  }
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(serverBaseUrl + "/heartbeat");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.POST("{}");
  http.end();
}

void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

${telemetryReadCode}
  String json;
  serializeJson(doc, json);

  HTTPClient http;
  http.begin(serverBaseUrl + "/data");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  
  int httpCode = http.POST(json);
  if (httpCode == HTTP_CODE_OK) {
    Serial.println("📤 Telemetry posted to server");
  }
  http.end();
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(serverBaseUrl + "/commands");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  if (http.GET() == HTTP_CODE_OK) {
    StaticJsonDocument<512> doc;
    deserializeJson(doc, http.getString());
    JsonArray commands = doc["commands"].as<JsonArray>();

    for (JsonObject cmd : commands) {
      int id = cmd["id"];
      int gpio = cmd["gpio"];
      int val = cmd["value"];

      Serial.printf("⚡ Executing command #%d on GPIO %d -> %d\\n", id, gpio, val);

      pinMode(gpio, OUTPUT);
      digitalWrite(gpio, val == 1 ? HIGH : LOW);

      // Send ACK back to laptop server
      HTTPClient ackHttp;
      ackHttp.begin(serverBaseUrl + "/commands/" + String(id) + "/ack");
      ackHttp.addHeader("X-Device-Token", DEVICE_TOKEN);
      ackHttp.POST("{}");
      ackHttp.end();
    }
  }
  http.end();
}
`;
  };

  const handleDownloadFile = () => {
    const code = generateFirmwareCode();
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${deviceId}_firmware.ino`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generateFirmwareCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Generating dynamic firmware sketch...</div>;
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link href={`/devices/${deviceId}`} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">ESP32 Firmware Generator</h1>
            <p className="text-sm text-gray-400 mt-0.5">Generate custom Arduino C++ sketch for <span className="text-blue-300 font-mono">{deviceId}</span></p>
          </div>
        </div>

        <button
          onClick={handleDownloadFile}
          className="flex items-center space-x-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold shadow-lg transition-all"
        >
          <Download className="h-4 w-4" />
          <span>Download .ino File</span>
        </button>
      </div>

      {/* Configured Components Banner */}
      <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-2xl flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-gray-300 block">Configured Device Hardware</span>
            <span className="text-xs text-blue-400 font-mono">
              {components.map((c) => `${c.name} (${c.type} on GPIO ${c.gpio_pin}${c.gpio_secondary !== -1 ? '/' + c.gpio_secondary : ''})`).join(' • ') || 'No components configured'}
            </span>
          </div>
        </div>

        <Link
          href={`/devices/${deviceId}/hardware`}
          className="text-xs text-gray-400 hover:text-white underline font-medium"
        >
          Change Pins
        </Link>
      </div>

      {/* Network Configuration Form */}
      <div className="glass-panel p-6 rounded-2xl border border-gray-800 space-y-4">
        <h3 className="font-bold text-white text-base flex items-center">
          <Wifi className="h-4 w-4 mr-2 text-blue-400" /> Enter Local Wi-Fi Credentials
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Wi-Fi SSID (Network Name)</label>
            <input
              type="text"
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
              placeholder="Home_WiFi"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Wi-Fi Password</label>
            <input
              type="password"
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Generated Code Preview Box */}
      <div className="glass-panel rounded-2xl border border-gray-800 overflow-hidden">
        <div className="p-4 bg-gray-900/80 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileCode2 className="h-4 w-4 text-purple-400" />
            <span className="font-mono text-xs text-gray-300">{deviceId}_firmware.ino</span>
          </div>

          <button
            onClick={handleCopyCode}
            className="flex items-center space-x-1 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium border border-gray-700"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>
        </div>

        <pre className="p-5 text-xs font-mono text-gray-300 bg-gray-950 overflow-x-auto max-h-96 leading-relaxed">
          <code>{generateFirmwareCode()}</code>
        </pre>
      </div>
    </div>
  );
}

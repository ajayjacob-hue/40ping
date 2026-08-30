'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileCode2, Download, Copy, Check, ArrowLeft, Wifi, Server, Key, ShieldCheck, Cpu } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, Device, Component } from '@/lib/api';
import Button from '@/components/ui/Button';
import WebSerialFlasher from '@/components/WebSerialFlasher';

export default function FirmwareGeneratorPage() {
  const params = useParams();
  const deviceId = params.id as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [rules, setRules] = useState<any[]>([]);
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
        setRules(devRes.data.rules || []);
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

    const backendUrl = getBackendUrl();
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
    let includes = `#include <WiFi.h>\n#include <WiFiClientSecure.h>\n#include <HTTPClient.h>\n#include <PubSubClient.h>\n#include <ArduinoJson.h>`;
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

    // Generate Edge Automation Logic from Active Rules
    const activeRules = rules.filter((r) => r.is_active !== false);
    let edgeAutomationsCode = '';
    if (activeRules.length === 0) {
      edgeAutomationsCode = `  // No active rules configured. AI Copilot rules will appear here automatically.\n`;
    } else {
      activeRules.forEach((r, idx) => {
        let conditionCode = '';
        const op = r.condition === 'GREATER_THAN' ? '>' : r.condition === 'LESS_THAN' ? '<' : '==';
        const isMomentary = r.sensor_component === 'PIR' || r.sensor_component === 'PUSH_BUTTON';
        const durationSec = r.duration_seconds || (isMomentary ? 5 : 0);

        if (r.sensor_component === 'DHT11') {
          conditionCode = `temp ${op} ${r.trigger_value}.0`;
        } else if (r.sensor_component === 'PIR') {
          conditionCode = `digitalRead(PIR_PIN) == HIGH`;
        } else if (r.sensor_component === 'LDR') {
          conditionCode = `analogRead(LDR_PIN) ${op} ${r.trigger_value}`;
        } else if (r.sensor_component === 'HC-SR04') {
          conditionCode = `distanceCm ${op} ${r.trigger_value}.0`;
        } else if (r.sensor_component === 'PUSH_BUTTON') {
          conditionCode = `digitalRead(BUTTON_PIN) == LOW`;
        } else {
          conditionCode = `sensorVal > ${r.trigger_value}`;
        }

        const pinName = `${r.action_component}_PIN`;
        const timerVar = `timer_${r.action_component.toLowerCase()}`;

        if (r.action_component === 'SERVO') {
          edgeAutomationsCode += `  // Rule ${idx + 1}: ${r.name}\n  if (${conditionCode}) {\n    servoMotor.write(${r.action_value});\n  }\n\n`;
        } else if (durationSec > 0) {
          const durationMs = durationSec * 1000;
          edgeAutomationsCode += `  // Rule ${idx + 1}: ${r.name} (${durationSec}s Timed Pulse)\n  if (${conditionCode}) {\n    ${timerVar} = millis() + ${durationMs}; // Keep ON for ${durationSec}s\n    digitalWrite(${pinName}, HIGH);\n  } else if (millis() > ${timerVar}) {\n    digitalWrite(${pinName}, LOW);  // Auto-off after ${durationSec}s\n  }\n\n`;
        } else {
          const onState = Number(r.action_value) === 1 ? 'HIGH' : 'LOW';
          const offState = Number(r.action_value) === 1 ? 'LOW' : 'HIGH';
          edgeAutomationsCode += `  // Rule ${idx + 1}: ${r.name} (State-based auto reset)\n  if (${conditionCode}) {\n    digitalWrite(${pinName}, ${onState});\n  } else {\n    digitalWrite(${pinName}, ${offState}); // Auto-off when condition ends\n  }\n\n`;
        }
      });
    }

    return `/*
 * IoT-to-Web Auto-Generated ESP32 Arduino Sketch (Cloud Connected)
 * Device Name: ${device?.name || 'Smart Room'}
 * Device ID:   ${deviceId}
 * Configured Components: ${components.map((c) => c.type).join(', ') || 'Default'}
 * Active Automation Conditions: ${activeRules.length}
 * Generated:   ${new Date().toLocaleString()}
 */

${includes}

// Wi-Fi Credentials
const char* WIFI_SSID     = "${wifiSsid}";
const char* WIFI_PASSWORD = "${wifiPassword}";

// Server Configuration (Render Cloud Backend Domain)
const char* SERVER_URL    = "${backendUrl}";

// Device Credentials
const char* DEVICE_ID     = "${deviceId}";
const char* DEVICE_TOKEN  = "${token}";

${pinDefs}
${sensorInitGlobal}
WiFiClient espClient;
WiFiClientSecure secureEspClient;
PubSubClient mqttClient(espClient);

String serverBaseUrl;
String mqttTelemetryTopic;
String mqttCommandTopic;
String mqttStatusTopic;

unsigned long lastTelemetryTime = 0;
unsigned long lastCommandPollTime = 0;
unsigned long lastHeartbeatTime = 0;

// Non-blocking Automation Timer Variables
unsigned long timer_led    = 0;
unsigned long timer_buzzer = 0;
unsigned long timer_relay  = 0;

void connectWiFi();
void connectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void initHttpClient(HTTPClient& http, const String& url);
void evaluateLocalAutomations();

void initHttpClient(HTTPClient& http, const String& url) {
  if (url.startsWith("https://")) {
    secureEspClient.setInsecure();
    http.begin(secureEspClient, url);
  } else {
    http.begin(espClient, url);
  }
}

// ========================================================
// ⚡ LOCAL EDGE SMART AUTOMATIONS (Auto-Synced with Cloud)
// ========================================================
void evaluateLocalAutomations() {
  ${hasDht ? 'float temp = dht.readTemperature();\n  float hum = dht.readHumidity();\n  if (isnan(temp)) temp = 25.0;\n' : ''}
  ${hasUltrasonic ? 'digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2); digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10); digitalWrite(TRIG_PIN, LOW); long duration = pulseIn(ECHO_PIN, HIGH, 25000); float distanceCm = (duration > 0) ? (duration * 0.034 / 2.0) : 100.0;\n' : ''}
${edgeAutomationsCode}
}

void setup() {
  Serial.begin(115200);
${setupCode}
  String baseUrl = String(SERVER_URL);
  if (baseUrl.endsWith("/")) {
    baseUrl.remove(baseUrl.length() - 1);
  }
  serverBaseUrl       = baseUrl + "/api/device/" + String(DEVICE_ID);
  mqttTelemetryTopic  = "devices/" + String(DEVICE_ID) + "/telemetry";
  mqttCommandTopic    = "devices/" + String(DEVICE_ID) + "/commands";
  mqttStatusTopic     = "devices/" + String(DEVICE_ID) + "/status";

  connectWiFi();
  connectMQTT();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  if (!mqttClient.connected()) {
    connectMQTT();
  } else {
    mqttClient.loop();
  }

  // 1. Evaluate Active Smart Edge Conditions Instantly (< 1ms latency)
  evaluateLocalAutomations();

  unsigned long currentMillis = millis();

  if (!mqttClient.connected() && (currentMillis - lastCommandPollTime >= 500)) {
    lastCommandPollTime = currentMillis;
    pollCommands();
  }

  if (currentMillis - lastTelemetryTime >= 2000) {
    lastTelemetryTime = currentMillis;
    sendTelemetry();
  }

  if (!mqttClient.connected() && (currentMillis - lastHeartbeatTime >= 10000)) {
    lastHeartbeatTime = currentMillis;
    sendHeartbeat();
  }

  delay(10);
}

void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connect(DEVICE_ID, mqttStatusTopic.c_str(), 1, true, "OFFLINE")) {
    mqttClient.publish(mqttStatusTopic.c_str(), "ONLINE", true);
    mqttClient.subscribe(mqttCommandTopic.c_str());
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (int i = 0; i < length; i++) msg += (char)payload[i];
  StaticJsonDocument<256> doc;
  if (!deserializeJson(doc, msg)) {
    int gpio = doc["gpio"] | -1;
    int val  = doc["value"] | 0;
    if (gpio >= 0) {
      pinMode(gpio, OUTPUT);
      digitalWrite(gpio, val == 1 ? HIGH : LOW);
    }
  }
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
  String url = serverBaseUrl + "/heartbeat";
  initHttpClient(http, url);
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
  String url = serverBaseUrl + "/data";
  initHttpClient(http, url);
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
  String url = serverBaseUrl + "/commands";
  initHttpClient(http, url);
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

      HTTPClient ackHttp;
      String ackUrl = serverBaseUrl + "/commands/" + String(id) + "/ack";
      initHttpClient(ackHttp, ackUrl);
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
    return <div className="dev-panel p-8 text-center text-xs text-zinc-400">Generating dynamic firmware sketch...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Link href={`/devices/${deviceId}`} className="text-zinc-400 hover:text-zinc-100 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">C++ Firmware Generator</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Generate custom Arduino C++ sketch configured for node <strong className="text-zinc-200 font-mono">{deviceId}</strong>.
          </p>
        </div>

        <Button variant="primary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={handleDownloadFile}>
          Download .ino Sketch
        </Button>
      </div>

      {/* WebSerial USB Browser Flasher */}
      <WebSerialFlasher deviceId={deviceId} deviceToken={device?.token} />

      {/* Configured Components Banner */}
      <div className="dev-panel p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-zinc-900 border border-zinc-800 rounded text-blue-400">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-zinc-200 block">Hardware Driver Mappings</span>
            <span className="text-xs font-mono text-zinc-400">
              {components.map((c) => `${c.name} (${c.type} on GPIO ${c.gpio_pin})`).join(' • ') || 'No components configured'}
            </span>
          </div>
        </div>

        <Link href={`/devices/${deviceId}/hardware`}>
          <Button variant="outline" size="sm">
            Edit Pins
          </Button>
        </Link>
      </div>

      {/* Network Configuration Form */}
      <div className="dev-panel p-5 space-y-4">
        <h3 className="text-xs font-bold text-zinc-100 flex items-center">
          <Wifi className="h-4 w-4 mr-2 text-blue-400" /> Wi-Fi Credentials Provisioning
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Wi-Fi SSID</label>
            <input
              type="text"
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
              placeholder="Home_WiFi"
              className="w-full bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-100 p-2 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Wi-Fi Password</label>
            <input
              type="password"
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-100 p-2 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Generated Code Preview Box */}
      <div className="dev-panel overflow-hidden border border-zinc-800 bg-[#09090b]">
        <div className="p-3 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileCode2 className="h-4 w-4 text-blue-400" />
            <span className="font-mono text-xs text-zinc-300">{deviceId}_firmware.ino</span>
          </div>

          <Button variant="ghost" size="sm" icon={copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} onClick={handleCopyCode}>
            {copied ? 'Copied' : 'Copy Code'}
          </Button>
        </div>

        <pre className="p-4 text-xs font-mono text-zinc-300 bg-[#09090b] overflow-x-auto max-h-96 leading-relaxed">
          <code>{generateFirmwareCode()}</code>
        </pre>
      </div>
    </div>
  );
}

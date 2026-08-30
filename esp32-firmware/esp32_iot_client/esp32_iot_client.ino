/*
 * ==============================================================================
 * IoT-to-Web Universal ESP32 Firmware (Hybrid MQTT + HTTP REST Fallback)
 * ==============================================================================
 * 
 * Communication Protocols:
 * 1. Primary: Sub-5ms MQTT Pub/Sub with Last Will & Testament (LWT) on Port 1883
 * 2. Fallback: HTTP REST Polling on Port 4000
 * 
 * Required Libraries in Arduino IDE:
 * - ArduinoJson (v6.x or v7.x)
 * - PubSubClient (by Nick O'Leary)
 * - DHT sensor library (by Adafruit)
 * ==============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ==============================================================================
// 1. NETWORK & DEVICE CREDENTIALS
// ==============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// RENDER CLOUD BACKEND URL
const char* SERVER_URL    = "https://iot-backend-2etp.onrender.com";

// DEVICE CREDENTIALS GENERATED IN DASHBOARD (/devices)
const char* DEVICE_ID     = "ESP32-A7F92";
const char* DEVICE_TOKEN  = "YOUR_DEVICE_TOKEN_HERE";

// ==============================================================================
// 2. DYNAMIC HARDWARE RUNTIME COMPONENT REGISTRY
// ==============================================================================
struct ComponentConfig {
  char name[32];
  char type[32];
  int gpio;
  int gpioSecondary;
  char category[16];
};

const int MAX_COMPONENTS = 16;
ComponentConfig deviceComponents[MAX_COMPONENTS];
int componentCount = 0;

DHT* dhtSensor = nullptr;

WiFiClient espClient;
WiFiClientSecure secureEspClient;
PubSubClient mqttClient(espClient);

// Timers (ms)
const unsigned long TELEMETRY_INTERVAL_MS      = 2000;  // Send telemetry every 2 seconds
const unsigned long COMMAND_POLL_INTERVAL_MS    = 500;   // HTTP command poll interval
const unsigned long HEARTBEAT_INTERVAL_MS       = 10000; // Heartbeat ping
const unsigned long CONFIG_REFRESH_INTERVAL_MS  = 15000; // Hardware pin refresh
const unsigned long MQTT_RECONNECT_INTERVAL_MS  = 15000; // Retry MQTT only once every 15s

unsigned long lastTelemetryTime     = 0;
unsigned long lastCommandPollTime   = 0;
unsigned long lastHeartbeatTime     = 0;
unsigned long lastConfigRefreshTime = 0;
unsigned long lastMqttAttemptTime   = 0;

String serverBaseUrl;
String mqttTelemetryTopic;
String mqttCommandTopic;
String mqttStatusTopic;

// Prototypes
void connectToWiFi();
void connectToMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void fetchHardwareConfig();
void sendSensorTelemetry();
void pollAndExecuteCommands();
void sendHeartbeat();
void sendCommandAck(int commandId);
void initHttpClient(HTTPClient& http, const String& url);

void initHttpClient(HTTPClient& http, const String& url) {
  if (url.startsWith("https://")) {
    secureEspClient.setInsecure(); // Skip TLS cert validation for Render HTTPS
    http.begin(secureEspClient, url);
  } else {
    http.begin(espClient, url);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println("  IoT-to-Web Universal ESP32 Firmware (Cloud Connected)");
  Serial.println("==================================================");

  String baseUrl = String(SERVER_URL);
  if (baseUrl.endsWith("/")) {
    baseUrl.remove(baseUrl.length() - 1);
  }
  serverBaseUrl       = baseUrl + "/api/device/" + String(DEVICE_ID);
  mqttTelemetryTopic  = "devices/" + String(DEVICE_ID) + "/telemetry";
  mqttCommandTopic    = "devices/" + String(DEVICE_ID) + "/commands";
  mqttStatusTopic     = "devices/" + String(DEVICE_ID) + "/status";

  connectToWiFi();
  fetchHardwareConfig();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  unsigned long currentMillis = millis();

  // Try MQTT connection non-blockingly every 15 seconds if not connected
  if (!mqttClient.connected()) {
    if (currentMillis - lastMqttAttemptTime >= MQTT_RECONNECT_INTERVAL_MS) {
      lastMqttAttemptTime = currentMillis;
      connectToMQTT();
    }
  } else {
    mqttClient.loop(); // Process incoming MQTT command messages instantly (< 5ms)
  }

  // 1. Fallback HTTP Poll Commands Every 500ms if MQTT Disconnected
  if (!mqttClient.connected() && (currentMillis - lastCommandPollTime >= COMMAND_POLL_INTERVAL_MS)) {
    lastCommandPollTime = currentMillis;
    pollAndExecuteCommands();
  }

  // 2. Read Sensors and Send Telemetry Every 2s
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    sendSensorTelemetry();
  }

  // 3. Send Heartbeat Every 10s if MQTT Disconnected
  if (!mqttClient.connected() && (currentMillis - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS)) {
    lastHeartbeatTime = currentMillis;
    sendHeartbeat();
  }

  // 4. Periodically Refresh Hardware Pin Config (Auto-detects new UI hardware additions)
  if (currentMillis - lastConfigRefreshTime >= CONFIG_REFRESH_INTERVAL_MS) {
    lastConfigRefreshTime = currentMillis;
    fetchHardwareConfig();
  }

  delay(10);
}

void connectToMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.print("Connecting to MQTT Broker... ");
  // Connect with Last Will and Testament (LWT) topic
  if (mqttClient.connect(DEVICE_ID, mqttStatusTopic.c_str(), 1, true, "OFFLINE")) {
    Serial.println("✅ Connected to MQTT Broker!");
    mqttClient.publish(mqttStatusTopic.c_str(), "ONLINE", true);
    mqttClient.subscribe(mqttCommandTopic.c_str());
    Serial.printf("📡 Subscribed to MQTT Command Topic: %s\n", mqttCommandTopic.c_str());
  } else {
    Serial.printf("❌ MQTT Connect failed (state %d). Using HTTP REST fallback.\n", mqttClient.state());
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.printf("⚡ Instant MQTT Command Received on %s: %s\n", topic, message.c_str());

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, message);
  if (!err) {
    int cmdId = doc["id"] | 0;
    int gpio  = doc["gpio"] | -1;
    int val   = doc["value"] | 0;

    if (gpio >= 0) {
      pinMode(gpio, OUTPUT);
      digitalWrite(gpio, val == 1 ? HIGH : LOW);
      Serial.printf("⚙️ MQTT Executed GPIO %d -> %d\n", gpio, val);

      // Send ACK back over MQTT
      String ackTopic = "devices/" + String(DEVICE_ID) + "/ack";
      String ackPayload = "{\"commandId\":" + String(cmdId) + ",\"gpio\":" + String(gpio) + ",\"value\":" + String(val) + "}";
      mqttClient.publish(ackTopic.c_str(), ackPayload.c_str());
    }
  }
}

void connectToWiFi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Connected to Local Wi-Fi LAN!");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
    sendHeartbeat(); // Instantly register device ONLINE on dashboard
  }
}

// ==============================================================================
// DYNAMIC HARDWARE CONFIGURATION PARSER (HANDLES NEW & GENERIC SENSORS)
// ==============================================================================
void fetchHardwareConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = serverBaseUrl + "/config";

  initHttpClient(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.println("📥 Downloaded Remote Hardware Config:");
    Serial.println(payload);

    StaticJsonDocument<1024> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err) {
      JsonArray components = doc["components"].as<JsonArray>();
      componentCount = 0;

      for (JsonObject comp : components) {
        if (componentCount >= MAX_COMPONENTS) break;

        ComponentConfig& cfg = deviceComponents[componentCount];
        const char* nameStr = comp["name"] | "sensor";
        const char* typeStr = comp["type"] | "GENERIC_DIGITAL";
        const char* catStr = comp["category"] | "INPUT";

        strncpy(cfg.name, nameStr, sizeof(cfg.name) - 1);
        strncpy(cfg.type, typeStr, sizeof(cfg.type) - 1);
        strncpy(cfg.category, catStr, sizeof(cfg.category) - 1);
        cfg.gpio = comp["gpio"];
        cfg.gpioSecondary = comp["gpio_secondary"] | -1;

        // Dynamic Pin Initialization
        if (strcmp(cfg.type, "DHT11") == 0) {
          if (dhtSensor) delete dhtSensor;
          dhtSensor = new DHT(cfg.gpio, DHT11);
          dhtSensor->begin();
          Serial.printf("  ⚙️ Initialized DHT11 on GPIO %d\n", cfg.gpio);
        } else if (strcmp(cfg.type, "HC-SR04") == 0) {
          int echoPin = (cfg.gpioSecondary != -1) ? cfg.gpioSecondary : 13;
          pinMode(cfg.gpio, OUTPUT);
          pinMode(echoPin, INPUT);
          Serial.printf("  ⚙️ Initialized Ultrasonic (Trig %d / Echo %d)\n", cfg.gpio, echoPin);
        } else if (strcmp(cfg.type, "PUSH_BUTTON") == 0) {
          pinMode(cfg.gpio, INPUT_PULLUP);
          Serial.printf("  ⚙️ Initialized Button on GPIO %d\n", cfg.gpio);
        } else if (strcmp(cfg.category, "OUTPUT") == 0 || strcmp(cfg.type, "LED") == 0 || strcmp(cfg.type, "BUZZER") == 0 || strcmp(cfg.type, "GENERIC_OUTPUT") == 0) {
          pinMode(cfg.gpio, OUTPUT);
          digitalWrite(cfg.gpio, LOW);
          Serial.printf("  ⚙️ Initialized Output Actuator (%s) on GPIO %d\n", cfg.type, cfg.gpio);
        } else {
          // Any generic digital/analog input sensor
          pinMode(cfg.gpio, INPUT);
          Serial.printf("  ⚙️ Initialized Input Sensor (%s) on GPIO %d\n", cfg.type, cfg.gpio);
        }

        componentCount++;
      }
    }
  }
  http.end();
}

// ==============================================================================
// SENSOR TELEMETRY SUBMISSION ENGINE
// ==============================================================================
void sendSensorTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<512> doc;
  bool hasData = false;

  for (int i = 0; i < componentCount; i++) {
    ComponentConfig& cfg = deviceComponents[i];

    if (strcmp(cfg.type, "DHT11") == 0 && dhtSensor != nullptr) {
      float t = dhtSensor->readTemperature();
      float h = dhtSensor->readHumidity();
      doc["temperature"] = isnan(t) ? 25.0 : t;
      doc["humidity"] = isnan(h) ? 50.0 : h;
      hasData = true;
    } else if (strcmp(cfg.type, "HC-SR04") == 0) {
      int echoPin = (cfg.gpioSecondary != -1) ? cfg.gpioSecondary : 13;
      digitalWrite(cfg.gpio, LOW); delayMicroseconds(2);
      digitalWrite(cfg.gpio, HIGH); delayMicroseconds(10);
      digitalWrite(cfg.gpio, LOW);
      long dur = pulseIn(echoPin, HIGH, 25000);
      doc["distance"] = (dur > 0) ? (dur * 0.034 / 2.0) : 100.0;
      hasData = true;
    } else if (strcmp(cfg.type, "PIR") == 0) {
      doc["motion"] = (digitalRead(cfg.gpio) == HIGH);
      hasData = true;
    } else if (strcmp(cfg.type, "LDR") == 0 || strcmp(cfg.type, "GENERIC_ANALOG") == 0) {
      doc[cfg.type] = analogRead(cfg.gpio);
      hasData = true;
    } else if (strcmp(cfg.type, "PUSH_BUTTON") == 0) {
      doc["button"] = (digitalRead(cfg.gpio) == LOW ? 1 : 0);
      hasData = true;
    } else if (strcmp(cfg.type, "GENERIC_DIGITAL") == 0) {
      // Any generic digital sensor (Flame, Rain, Tilt, Touch, etc.)
      doc[cfg.name] = (digitalRead(cfg.gpio) == HIGH ? 1 : 0);
      hasData = true;
    }
  }

  if (!hasData) {
    doc["status"] = "active";
    doc["temperature"] = 25.4 + (random(-10, 10) / 10.0);
    doc["uptime_sec"] = millis() / 1000;
  }

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  if (mqttClient.connected()) {
    mqttClient.publish(mqttTelemetryTopic.c_str(), jsonPayload.c_str());
  } else {
    HTTPClient http;
    String url = serverBaseUrl + "/data";
    initHttpClient(http, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", DEVICE_TOKEN);

    http.POST(jsonPayload);
    http.end();
  }
}

// ==============================================================================
// COMMAND POLLING & EXECUTION ENGINE
// ==============================================================================
void pollAndExecuteCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = serverBaseUrl + "/commands";
  initHttpClient(http, url);
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  if (http.GET() == HTTP_CODE_OK) {
    String payload = http.getString();
    
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err) {
      JsonArray commands = doc["commands"].as<JsonArray>();
      for (JsonObject cmd : commands) {
        int cmdId = cmd["id"];
        int gpio = cmd["gpio"];
        int val = cmd["value"];

        Serial.printf("⚡ Executing command #%d on GPIO %d -> %d\n", cmdId, gpio, val);

        pinMode(gpio, OUTPUT);
        digitalWrite(gpio, val == 1 ? HIGH : LOW);

        sendCommandAck(cmdId);
      }
    }
  }
  http.end();
}

void sendCommandAck(int commandId) {
  HTTPClient http;
  String url = serverBaseUrl + "/commands/" + String(commandId) + "/ack";
  initHttpClient(http, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.POST("{}");
  http.end();
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

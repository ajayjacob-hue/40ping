/*
 * ==============================================================================
 * IoT-to-Web Universal ESP32 Firmware (Fully Dynamic Hardware Configuration)
 * ==============================================================================
 * 
 * Handles ALL Supported & Custom/Generic Sensors & Actuators at Runtime:
 * - Special Drivers: DHT11, PIR, HC-SR04, LDR, Push Button, LED, Buzzer
 * - Generic Sensors: Any Digital Sensor (Flame/Rain/Touch/Tilt), Any Analog Sensor (Soil Moisture/Gas MQ2/Sound/Potentiometer)
 * - Generic Actuators: Any Digital Output (Relay, Solenoid, Motor Driver, Indicator)
 * 
 * Required Libraries in Arduino IDE:
 * - ArduinoJson (v6.x or v7.x)
 * - DHT sensor library (by Adafruit)
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ==============================================================================
// 1. NETWORK & DEVICE CREDENTIALS
// ==============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// LAPTOP LOCAL LAN IP ADDRESS (e.g. 192.168.1.100 or 172.16.208.18)
const char* SERVER_IP     = "192.168.1.100";
const int   SERVER_PORT   = 4000;

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

// Timers (ms)
const unsigned long TELEMETRY_INTERVAL_MS   = 2000; // Send telemetry every 2 seconds
const unsigned long COMMAND_POLL_INTERVAL_MS = 100;  // Fast poll commands every 100ms for real-time responsiveness
const unsigned long HEARTBEAT_INTERVAL_MS    = 10000; // Heartbeat ping every 10 seconds

unsigned long lastTelemetryTime   = 0;
unsigned long lastCommandPollTime = 0;
unsigned long lastHeartbeatTime   = 0;

String serverBaseUrl;

// Prototypes
void connectToWiFi();
void fetchHardwareConfig();
void sendSensorTelemetry();
void pollAndExecuteCommands();
void sendHeartbeat();
void sendCommandAck(int commandId);

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println("  IoT-to-Web Universal Dynamic ESP32 Firmware     ");
  Serial.println("==================================================");

  serverBaseUrl = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/device/" + String(DEVICE_ID);

  connectToWiFi();
  fetchHardwareConfig();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  unsigned long currentMillis = millis();

  // 1. Poll Commands Every 1s
  if (currentMillis - lastCommandPollTime >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollTime = currentMillis;
    pollAndExecuteCommands();
  }

  // 2. Read Sensors and Send Telemetry Every 2s
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    sendSensorTelemetry();
  }

  // 3. Send Heartbeat Every 10s
  if (currentMillis - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = currentMillis;
    sendHeartbeat();
  }

  delay(10);
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

  http.begin(url);
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
  }

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  HTTPClient http;
  http.begin(serverBaseUrl + "/data");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  http.POST(jsonPayload);
  http.end();
}

// ==============================================================================
// COMMAND POLLING & EXECUTION ENGINE
// ==============================================================================
void pollAndExecuteCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(serverBaseUrl + "/commands");
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
  http.begin(serverBaseUrl + "/commands/" + String(commandId) + "/ack");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.POST("{}");
  http.end();
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

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import StatusDot from '@/components/ui/StatusDot';
import CodeBlock from '@/components/ui/CodeBlock';
import {
  Cpu,
  Radio,
  Wifi,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
  Download,
  Terminal,
  AlertCircle
} from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, Device } from '@/lib/api';

export default function ProvisioningWizardPage() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  // Auto-detected Local Gateway Server Info
  const [serverIp, setServerIp] = useState<string>('127.0.0.1');
  const [serverPort, setServerPort] = useState<number>(4000);

  // Provisioning Credentials Form State
  const [wifiSsid, setWifiSsid] = useState<string>('YOUR_WIFI_SSID');
  const [wifiPassword, setWifiPassword] = useState<string>('YOUR_WIFI_PASSWORD');
  const [newDeviceName, setNewDeviceName] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Real Verification Polling State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'IDLE' | 'POLLING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [pollingCountdown, setPollingCountdown] = useState<number>(15);
  const [copied, setCopied] = useState(false);

  const backendUrl = getBackendUrl();

  // 1. Fetch real devices list and local gateway server IP on mount
  const loadInitialData = async () => {
    try {
      const [devRes, infoRes] = await Promise.all([
        axios.get(`${backendUrl}/api/devices`).catch(() => ({ data: { devices: [] } })),
        axios.get(`${backendUrl}/api/server-info`).catch(() => ({ data: { localIp: '127.0.0.1', port: 4000 } })),
      ]);

      const devList: Device[] = devRes.data.devices || [];
      setDevices(devList);

      if (devList.length > 0) {
        setSelectedDeviceId(devList[0].id);
        setSelectedDevice(devList[0]);
      }

      if (infoRes.data.localIp) setServerIp(infoRes.data.localIp);
      if (infoRes.data.port) setServerPort(infoRes.data.port);
    } catch (err) {
      console.error('Failed to load provisioning initial data:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [backendUrl]);

  // Handle Device Selection change
  const handleDeviceSelect = (id: string) => {
    setSelectedDeviceId(id);
    const matched = devices.find((d) => d.id === id) || null;
    setSelectedDevice(matched);
  };

  // Register New Device directly inside the Wizard
  const handleCreateNewDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName.trim()) return;

    try {
      setIsRegistering(true);
      const res = await axios.post(`${backendUrl}/api/devices`, {
        name: newDeviceName.trim(),
      });

      const newDev: Device = res.data.device;
      setDevices((prev) => [newDev, ...prev]);
      setSelectedDeviceId(newDev.id);
      setSelectedDevice(newDev);
      setNewDeviceName('');
    } catch (err) {
      alert('Failed to register device.');
    } finally {
      setIsRegistering(false);
    }
  };

  // 2. Real Verification Ping: Query Backend API to check if node is ONLINE in database
  const runRealConnectionVerification = async () => {
    if (!selectedDeviceId) return;

    setIsVerifying(true);
    setVerifyStatus('POLLING');
    setPollingCountdown(15);

    let attempts = 0;
    const maxAttempts = 8; // Poll for 16 seconds

    const pollInterval = setInterval(async () => {
      attempts++;
      setPollingCountdown((prev) => Math.max(0, prev - 2));

      try {
        const res = await axios.get(`${backendUrl}/api/devices/${selectedDeviceId}`);
        const currentDev: Device = res.data.device;

        if (currentDev && currentDev.status === 'ONLINE') {
          clearInterval(pollInterval);
          setSelectedDevice(currentDev);
          setIsVerifying(false);
          setVerifyStatus('SUCCESS');
          setCurrentStep(5);
          return;
        }
      } catch (err) {
        console.error('Verification poll error:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        setIsVerifying(false);
        setVerifyStatus('FAILED');
      }
    }, 2000);
  };

  // Generate Real C++ Firmware Sketch Code
  const generateFirmwareCode = () => {
    const token = selectedDevice?.token || 'YOUR_DEVICE_TOKEN_HERE';

    return `/*
 * IoT-to-Web Auto-Generated ESP32 Arduino Sketch
 * Device ID: ${selectedDeviceId || 'ESP32-A7F92'}
 * Server IP: ${serverIp}:${serverPort}
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID     = "${wifiSsid}";
const char* WIFI_PASSWORD = "${wifiPassword}";

const char* SERVER_IP     = "${serverIp}";
const int   SERVER_PORT   = ${serverPort};
const int   MQTT_PORT     = 1883;

const char* DEVICE_ID     = "${selectedDeviceId || 'ESP32-A7F92'}";
const char* DEVICE_TOKEN  = "${token}";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

String mqttTelemetryTopic;
String mqttCommandTopic;
String mqttStatusTopic;

unsigned long lastTelemetryTime = 0;

void connectWiFi() {
  Serial.print("Connecting to WiFi "); Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi Connected!");
}

void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connect(DEVICE_ID, mqttStatusTopic.c_str(), 1, true, "OFFLINE")) {
    mqttClient.publish(mqttStatusTopic.c_str(), "ONLINE", true);
    mqttClient.subscribe(mqttCommandTopic.c_str());
    Serial.println("✅ Connected to MQTT Broker!");
  }
}

void setup() {
  Serial.begin(115200);
  mqttTelemetryTopic = "devices/" + String(DEVICE_ID) + "/telemetry";
  mqttCommandTopic   = "devices/" + String(DEVICE_ID) + "/commands";
  mqttStatusTopic    = "devices/" + String(DEVICE_ID) + "/status";

  mqttClient.setServer(SERVER_IP, MQTT_PORT);
  connectWiFi();
  connectMQTT();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqttClient.connected()) connectMQTT();
  else mqttClient.loop();

  if (millis() - lastTelemetryTime >= 2000) {
    lastTelemetryTime = millis();
    StaticJsonDocument<256> doc;
    doc["status"] = "online";
    String payload;
    serializeJson(doc, payload);
    mqttClient.publish(mqttTelemetryTopic.c_str(), payload.c_str());
  }
  delay(10);
}`;
  };

  const handleDownloadIno = () => {
    const code = generateFirmwareCode();
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedDeviceId || 'esp32'}_firmware.ino`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generateFirmwareCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-800/80 pb-4">
        <div className="flex items-center space-x-2">
          <Link href="/devices" className="text-zinc-400 hover:text-zinc-100 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">ESP32 Hardware Deployment Wizard</h1>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          Flash, provision network credentials, and verify real-time node connectivity.
        </p>
      </div>

      {/* Stepper Header */}
      <div className="dev-panel p-4 flex items-center justify-between font-mono text-xs text-zinc-400 border-zinc-800">
        {[
          { step: 1, label: 'Node Select' },
          { step: 2, label: 'C++ Code' },
          { step: 3, label: 'Provision' },
          { step: 4, label: 'Real Verify' },
          { step: 5, label: 'Complete' },
        ].map((s) => (
          <div key={s.step} className="flex items-center space-x-1.5">
            <span
              className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                currentStep === s.step
                  ? 'bg-blue-600 text-white'
                  : currentStep > s.step
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {currentStep > s.step ? '✓' : s.step}
            </span>
            <span className={currentStep === s.step ? 'text-zinc-100 font-bold' : ''}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* STEP 1: Select or Register Node */}
      {currentStep === 1 && (
        <div className="dev-panel p-6 space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-zinc-100">Step 1: Select Target Hardware Node</h2>
            <p className="text-xs text-zinc-400">Choose a registered node or create a new hardware entry in database.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Select Registered Node</label>
              {devices.length === 0 ? (
                <div className="p-3 bg-zinc-950 rounded border border-zinc-800 text-xs text-zinc-400">
                  No devices registered in database. Create one below.
                </div>
              ) : (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => handleDeviceSelect(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2.5 font-mono"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id}) — Status: {d.status}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Selected Device Infrastructure Details */}
            {selectedDevice && (
              <div className="p-4 bg-zinc-950 rounded border border-zinc-800 flex items-center justify-between font-mono text-xs">
                <div className="space-y-1">
                  <div className="font-bold text-zinc-100">{selectedDevice.name}</div>
                  <div className="text-zinc-400 text-[11px]">ID: {selectedDevice.id}</div>
                  <div className="text-blue-300 text-[11px] truncate max-w-xs">Token: {selectedDevice.token}</div>
                </div>
                <StatusDot status={selectedDevice.status} />
              </div>
            )}

            {/* Option to Register New Node */}
            <div className="pt-3 border-t border-zinc-800 space-y-2">
              <span className="text-xs font-medium text-zinc-300">Or Register New Hardware Node</span>
              <form onSubmit={handleCreateNewDevice} className="flex gap-2">
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="e.g. Greenhouse Sensor Node"
                  className="flex-1 bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2"
                />
                <Button variant="secondary" size="sm" type="submit" loading={isRegistering}>
                  Create Node
                </Button>
              </form>
            </div>
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-zinc-800">
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedDeviceId}
              icon={<ArrowRight className="h-3.5 w-3.5" />}
              onClick={() => setCurrentStep(2)}
            >
              Next: Generated C++ Code ➔
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: C++ Firmware Code & Flashing Options */}
      {currentStep === 2 && (
        <div className="dev-panel p-6 space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-zinc-100">Step 2: Generated C++ Arduino Sketch</h2>
            <p className="text-xs text-zinc-400">
              Download sketch or copy directly into Arduino IDE / PlatformIO for <strong className="text-zinc-200 font-mono">{selectedDeviceId}</strong>.
            </p>
          </div>

          <div className="dev-panel overflow-hidden border border-zinc-800 bg-[#09090b]">
            <div className="p-3 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-300">{selectedDeviceId}_firmware.ino</span>
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm" icon={copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} onClick={handleCopyCode}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={handleDownloadIno}>
                  Download .ino
                </Button>
              </div>
            </div>
            <pre className="p-4 text-xs font-mono text-zinc-300 bg-[#09090b] overflow-x-auto max-h-64 leading-relaxed">
              <code>{generateFirmwareCode()}</code>
            </pre>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setCurrentStep(1)}>
              ← Back
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCurrentStep(3)}>
              Next: Network Provisioning ➔
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Provision Network Credentials */}
      {currentStep === 3 && (
        <div className="dev-panel p-6 space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-zinc-100">Step 3: Provision Network & Gateway Config</h2>
            <p className="text-xs text-zinc-400">Specify Wi-Fi credentials and local laptop Gateway IPv4 address.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Wi-Fi SSID</label>
              <input
                type="text"
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2.5 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Wi-Fi Password</label>
              <input
                type="password"
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2.5 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Gateway Server IP</label>
              <input
                type="text"
                value={serverIp}
                onChange={(e) => setServerIp(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2.5 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setCurrentStep(2)}>
              ← Back
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCurrentStep(4)}>
              Next: Connection Verification ➔
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Real Connection Verification */}
      {currentStep === 4 && (
        <div className="dev-panel p-6 space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-zinc-100">Step 4: Real Connectivity Verification</h2>
            <p className="text-xs text-zinc-400">
              Querying database to check if <strong className="text-zinc-200 font-mono">{selectedDeviceId}</strong> has established connection.
            </p>
          </div>

          <div className="p-4 bg-zinc-950 rounded border border-zinc-800 font-mono text-xs space-y-3">
            <div className="flex justify-between border-b border-zinc-900 pb-2">
              <span className="text-zinc-500">Target Node ID:</span>
              <span className="text-zinc-100 font-bold">{selectedDeviceId}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-900 pb-2">
              <span className="text-zinc-500">Target Gateway URL:</span>
              <span className="text-blue-400">http://{serverIp}:{serverPort}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Embedded MQTT Port:</span>
              <span className="text-emerald-400">1883</span>
            </div>
          </div>

          {verifyStatus === 'POLLING' && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded text-xs flex items-center space-x-3 font-mono">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
              <div>
                <span className="font-bold block">Polling Backend Database... ({pollingCountdown}s)</span>
                <span className="text-[11px] text-zinc-400">Listening for telemetry packet or MQTT heartbeat from hardware node...</span>
              </div>
            </div>
          )}

          {verifyStatus === 'FAILED' && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded text-xs space-y-2">
              <div className="flex items-center space-x-2 font-bold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>No active connection detected yet for {selectedDeviceId}.</span>
              </div>
              <p className="text-[11px] text-zinc-300 font-mono">
                Make sure your ESP32 is powered with the uploaded firmware code, or run <code className="text-emerald-400">npm run simulator</code> to simulate a live hardware node!
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setCurrentStep(3)}>
              ← Back
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={isVerifying}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={runRealConnectionVerification}
            >
              Run Connection Verification
            </Button>
          </div>
        </div>
      )}

      {/* STEP 5: Complete */}
      {currentStep === 5 && (
        <div className="dev-panel p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-100">Node Successfully Verified & Online!</h2>
          <p className="text-xs text-zinc-400 max-w-md mx-auto font-mono">
            <strong className="text-zinc-100">{selectedDeviceId}</strong> is authenticated, sending live telemetry to gateway http://{serverIp}:{serverPort}, and ready for edge automation rules.
          </p>

          <div className="pt-4 flex items-center justify-center space-x-3">
            <Link href="/devices">
              <Button variant="outline" size="sm">
                Device Registry
              </Button>
            </Link>
            <Link href={`/devices/${selectedDeviceId}`}>
              <Button variant="primary" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                Open Device Console
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

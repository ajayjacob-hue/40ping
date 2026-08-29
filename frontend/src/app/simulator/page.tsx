'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Terminal, Play, Pause, RefreshCw, Cpu, Activity, Zap, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, Device } from '@/lib/api';

export default function WebSimulatorPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('ESP32-A7F92');
  const [deviceToken, setDeviceToken] = useState<string>('');

  // Simulator controls state
  const [temperature, setTemperature] = useState<number>(28.4);
  const [humidity, setHumidity] = useState<number>(64);
  const [motion, setMotion] = useState<boolean>(false);
  const [light, setLight] = useState<number>(450);
  const [distance, setDistance] = useState<number>(22.5);
  const [autoLoop, setAutoLoop] = useState<boolean>(true);

  // Output component state
  const [simulatedLed, setSimulatedLed] = useState<boolean>(false);
  const [simulatedBuzzer, setSimulatedBuzzer] = useState<boolean>(false);
  const [simulatedServo, setSimulatedServo] = useState<number>(0);

  // Terminal logs
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 50)]);
  };

  // Fetch device list on mount
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await axios.get(`${getBackendUrl()}/api/devices`);
        const devList: Device[] = res.data.devices || [];
        setDevices(devList);

        if (devList.length > 0) {
          setSelectedDeviceId(devList[0].id);
          setDeviceToken(devList[0].token);
        } else {
          // Register demo device automatically for simulator
          const createRes = await axios.post(`${getBackendUrl()}/api/devices`, { name: 'Smart Room (Simulated)' });
          const newDev = createRes.data.device;
          setDevices([newDev]);
          setSelectedDeviceId(newDev.id);
          setDeviceToken(newDev.token);
          addLog(`Registered new simulated device: ${newDev.id}`);
        }
      } catch (err: any) {
        addLog(`Error connecting to backend: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();
  }, []);

  // Update token when selected device changes
  useEffect(() => {
    const matched = devices.find((d) => d.id === selectedDeviceId);
    if (matched) setDeviceToken(matched.token);
  }, [selectedDeviceId, devices]);

  // Command Polling Loop (Every 1s)
  useEffect(() => {
    if (!selectedDeviceId || !deviceToken) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${getBackendUrl()}/api/device/${selectedDeviceId}/commands`, {
          headers: { 'X-Device-Token': deviceToken },
        });

        const commands = res.data.commands || [];
        for (const cmd of commands) {
          addLog(`⚡ EXECUTED COMMAND [#${cmd.id}]: ${cmd.type} on GPIO ${cmd.gpio} -> ${cmd.value}`);

          if (cmd.gpio === 18) setSimulatedLed(cmd.value === 1);
          if (cmd.gpio === 19) setSimulatedBuzzer(cmd.value === 1);
          if (cmd.gpio === 21) setSimulatedServo(cmd.value);

          // ACK Command
          await axios.post(`${getBackendUrl()}/api/device/${selectedDeviceId}/commands/${cmd.id}/ack`, {}, {
            headers: { 'X-Device-Token': deviceToken },
          });
        }
      } catch (err: any) {
        // Silent error handling for poll
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedDeviceId, deviceToken]);

  // Telemetry Auto-Loop (Every 2s)
  useEffect(() => {
    if (!autoLoop || !selectedDeviceId || !deviceToken) return;

    const interval = setInterval(() => {
      sendTelemetryPayload();
    }, 2000);

    return () => clearInterval(interval);
  }, [autoLoop, selectedDeviceId, deviceToken, temperature, humidity, motion, light, distance]);

  const sendTelemetryPayload = async () => {
    if (!selectedDeviceId || !deviceToken) return;

    const payload = {
      temperature,
      humidity,
      motion,
      light,
      distance,
    };

    try {
      const res = await axios.post(`${getBackendUrl()}/api/device/${selectedDeviceId}/data`, payload, {
        headers: { 'X-Device-Token': deviceToken },
      });

      addLog(`📤 Sent Telemetry -> Temp: ${temperature}°C | Hum: ${humidity}% | Motion: ${motion ? 'YES' : 'NO'}`);
      if (res.data.automationsTriggered > 0) {
        addLog(`⚡ ${res.data.automationsTriggered} Automation Rule(s) Triggered!`);
      }
    } catch (err: any) {
      addLog(`⚠️ Telemetry post error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center">
            <Terminal className="h-6 w-6 mr-2 text-emerald-400" /> Interactive ESP32 Web Simulator
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Simulate hardware inputs and output actuation without needing a physical ESP32.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setAutoLoop(!autoLoop)}
            className={`flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-xs font-semibold rounded-xl border border-gray-700 ${
              autoLoop ? 'text-emerald-400' : 'text-gray-400'
            }`}
          >
            {autoLoop ? <Pause className="h-4 w-4 text-emerald-400" /> : <Play className="h-4 w-4" />}
            <span>Auto Loop: {autoLoop ? 'RUNNING (2s)' : 'PAUSED'}</span>
          </button>

          <button
            onClick={sendTelemetryPayload}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg glow-blue"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Send Now</span>
          </button>
        </div>
      </div>

      {/* Target Device Selector & Output Actuator Status Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Target Device Select */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800 space-y-3">
          <label className="block text-xs font-medium text-gray-400 uppercase">Target Device Node</label>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.id})
              </option>
            ))}
          </select>
          <div className="text-[11px] text-gray-500 font-mono">
            Token: {deviceToken.substring(0, 12)}...
          </div>
        </div>

        {/* Output State: LED */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase block">Simulated LED (GPIO 18)</span>
            <span className={`text-xl font-bold mt-1 block ${simulatedLed ? 'text-emerald-400' : 'text-gray-500'}`}>
              {simulatedLed ? '🟢 HIGH (ON)' : '🔴 LOW (OFF)'}
            </span>
          </div>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${simulatedLed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 glow-green' : 'bg-gray-800 text-gray-600'}`}>
            <Zap className="h-6 w-6" />
          </div>
        </div>

        {/* Output State: Buzzer & Servo */}
        <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase block">Audio & Servo Actuators</span>
            <div className="text-xs space-y-1 mt-1 font-mono">
              <span className="block text-gray-300">Buzzer: <strong className={simulatedBuzzer ? 'text-amber-400' : 'text-gray-500'}>{simulatedBuzzer ? 'BEEPing' : 'Silent'}</strong></span>
              <span className="block text-gray-300">Servo Angle: <strong className="text-blue-400">{simulatedServo}°</strong></span>
            </div>
          </div>
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
            <Cpu className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Interactive Sensor Input Sliders */}
      <div className="glass-panel p-6 rounded-2xl border border-gray-800 space-y-6">
        <h3 className="font-bold text-white text-base">Interactive Sensor Controls</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Temp Slider */}
          <div className="p-4 bg-gray-900/80 rounded-xl border border-gray-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-amber-400">DHT11 Temperature</span>
              <span className="font-mono text-white font-bold">{temperature}°C</span>
            </div>
            <input
              type="range"
              min="15.0"
              max="45.0"
              step="0.5"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          {/* Humidity Slider */}
          <div className="p-4 bg-gray-900/80 rounded-xl border border-gray-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-blue-400">DHT11 Humidity</span>
              <span className="font-mono text-white font-bold">{humidity}%</span>
            </div>
            <input
              type="range"
              min="20"
              max="90"
              value={humidity}
              onChange={(e) => setHumidity(Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          {/* Motion Toggle */}
          <div className="p-4 bg-gray-900/80 rounded-xl border border-gray-800 flex items-center justify-between">
            <div>
              <span className="font-semibold text-xs text-purple-400 block">PIR Motion Sensor</span>
              <span className="text-[11px] text-gray-400">Digital Pin 5</span>
            </div>
            <button
              onClick={() => setMotion(!motion)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                motion
                  ? 'bg-emerald-600 text-white shadow-lg glow-green'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {motion ? '🏃 MOTION DETECTED' : 'CLEAR'}
            </button>
          </div>
        </div>
      </div>

      {/* Simulator Log Output Console */}
      <div className="glass-panel rounded-2xl border border-gray-800 overflow-hidden">
        <div className="p-4 bg-gray-900/80 border-b border-gray-800 flex items-center justify-between">
          <span className="font-mono text-xs font-semibold text-emerald-400 flex items-center">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-2"></span>
            Simulator REST Traffic Console
          </span>
          <button onClick={() => setLogs([])} className="text-xs text-gray-500 hover:text-gray-300">
            Clear Console
          </button>
        </div>

        <div className="p-4 bg-gray-950 font-mono text-xs text-gray-300 max-h-60 overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <p className="text-gray-600 italic">Simulator initializing...</p>
          ) : (
            logs.map((log, i) => <div key={i}>{log}</div>)
          )}
        </div>
      </div>
    </div>
  );
}

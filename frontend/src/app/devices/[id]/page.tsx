'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import StatusDot from '@/components/ui/StatusDot';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import CodeBlock from '@/components/ui/CodeBlock';
import {
  Cpu,
  Activity,
  Zap,
  Power,
  Clock,
  Wifi,
  Settings,
  Terminal,
  FileCode2,
  Sliders,
  Radio,
  Copy,
  Check,
  BarChart3,
  Layers,
  Send,
  Database
} from 'lucide-react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { getBackendUrl, Device, Component, SensorReading, DeviceCommand } from '@/lib/api';

export default function DeviceDetailPage() {
  const params = useParams();
  const deviceId = params.id as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Tab: 'overview' | 'telemetry' | 'hardware' | 'automations' | 'commands' | 'logs' | 'firmware'
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Dynamic telemetry state map
  const [liveTelemetry, setLiveTelemetry] = useState<{ [key: string]: any }>({});
  const [copiedToken, setCopiedToken] = useState(false);

  // Manual Command Form
  const [targetGpio, setTargetGpio] = useState<number>(18);
  const [targetValue, setTargetValue] = useState<number>(1);
  const [commandSending, setCommandSending] = useState(false);

  const backendUrl = getBackendUrl();

  const fetchDeviceData = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/devices/${deviceId}`);
      setDevice(res.data.device);
      const comps: Component[] = res.data.components || [];
      setComponents(comps);
      setCommands(res.data.commands || []);
      setRules(res.data.rules || []);

      const historicalReadings: SensorReading[] = res.data.readings || [];
      setReadings(historicalReadings);

      // Extract latest telemetry map
      const latestMap: { [key: string]: any } = {};
      historicalReadings.forEach((r) => {
        if (latestMap[r.reading_type] === undefined) {
          latestMap[r.reading_type] = r.reading_type === 'motion' ? Number(r.value) === 1 : Number(r.value);
        }
      });
      setLiveTelemetry(latestMap);
    } catch (err) {
      console.error('Failed to load device detail:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeviceData();

    const socket: Socket = io(backendUrl);

    socket.on('connect', () => {
      socket.emit('join_device', deviceId);
    });

    socket.on('device_telemetry', (data: any) => {
      if (data.deviceId === deviceId && data.readings) {
        const r = data.readings;
        setLiveTelemetry((prev) => ({ ...prev, ...r }));
        setDevice((prev) => (prev ? { ...prev, status: 'ONLINE', last_seen: new Date().toISOString() } : prev));

        // Append to historical readings
        const newReadings: SensorReading[] = [];
        for (const [key, val] of Object.entries(r)) {
          if (key === 'token' || key === 'deviceId') continue;
          newReadings.push({
            id: Date.now(),
            device_id: deviceId,
            component_type: key.toUpperCase(),
            reading_type: key.toLowerCase(),
            value: typeof val === 'number' ? val : typeof val === 'boolean' ? (val ? 1 : 0) : 0,
            raw_data: JSON.stringify({ [key]: val }),
            timestamp: new Date().toISOString(),
          });
        }
        setReadings((prev) => [...newReadings, ...prev].slice(0, 100));
      }
    });

    socket.on('device_heartbeat', (data: any) => {
      if (data.deviceId === deviceId) {
        setDevice((prev) =>
          prev ? { ...prev, status: data.status as 'ONLINE' | 'OFFLINE', ip_address: data.ipAddress || prev.ip_address } : prev
        );
      }
    });

    socket.on('command_created', (cmd: DeviceCommand) => {
      if (cmd.device_id === deviceId) {
        setCommands((prev) => [cmd, ...prev]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [deviceId, backendUrl]);

  // Send Manual Actuator Command
  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCommandSending(true);
      await axios.post(`${backendUrl}/api/devices/${deviceId}/commands`, {
        command_type: 'GPIO_WRITE',
        gpio_pin: targetGpio,
        value: targetValue,
      });
      fetchDeviceData();
    } catch (err) {
      alert('Failed to dispatch command.');
    } finally {
      setCommandSending(false);
    }
  };

  const copyToken = () => {
    if (!device) return;
    navigator.clipboard.writeText(device.token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  // Output Actuators list for Quick Control
  const actuatorComponents = useMemo(() => {
    return components.filter((c) => c.category === 'OUTPUT' || ['LED', 'BUZZER', 'RELAY', 'GENERIC_OUTPUT'].includes(c.type));
  }, [components]);

  // SVG Chart points
  const chartPoints = useMemo(() => {
    const list = [...readings].reverse();
    if (list.length < 2) return '';
    const width = 750;
    const height = 150;
    const vals = list.map((r) => Number(r.value) || 0);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;

    const points = list.map((item, idx) => {
      const x = (idx / (list.length - 1)) * width;
      const y = height - (((Number(item.value) || 0) - min) / range) * (height - 20) - 10;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  }, [readings]);

  if (loading || !device) {
    return <div className="dev-panel p-8 text-center text-xs text-zinc-400">Loading device console...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">{device.name}</h1>
            <span className="font-mono text-xs text-zinc-400 font-semibold px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded">
              {device.id}
            </span>
            <StatusDot status={device.status} />
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Last seen {device.last_seen ? new Date(device.last_seen).toLocaleTimeString() : 'Recently'} • IP: {device.ip_address || '---'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Link href={`/devices/${deviceId}/hardware`}>
            <Button variant="secondary" size="sm" icon={<Sliders className="h-3.5 w-3.5" />}>
              Configure Hardware
            </Button>
          </Link>
          <Link href={`/devices/${deviceId}/firmware`}>
            <Button variant="outline" size="sm" icon={<FileCode2 className="h-3.5 w-3.5" />}>
              Firmware Code
            </Button>
          </Link>
        </div>
      </div>

      {/* Developer Console Tabs */}
      <div className="flex items-center space-x-1 border-b border-zinc-800 text-xs font-medium">
        {[
          { id: 'overview', label: 'Overview', icon: Cpu },
          { id: 'telemetry', label: 'Telemetry Stream', icon: Activity },
          { id: 'hardware', label: 'Hardware Pins', icon: Sliders },
          { id: 'automations', label: 'Automation Rules', icon: Zap },
          { id: 'commands', label: 'Actuator Commands', icon: Power },
          { id: 'logs', label: 'Logs', icon: Terminal },
          { id: 'firmware', label: 'Firmware & Provision', icon: Radio },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1.5 px-3 py-2 border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-500 text-zinc-100 font-semibold bg-zinc-900/40'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/20'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Current Telemetry Readings Grid */}
          <div>
            <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Current Telemetry Metrics
            </h3>
            {Object.keys(liveTelemetry).length === 0 ? (
              <div className="dev-panel p-6 text-center text-xs text-zinc-500 font-mono">
                No active telemetry payloads received yet from hardware node.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(liveTelemetry).map(([key, val]) => (
                  <div key={key} className="dev-card p-4 space-y-1">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase font-semibold">{key}</span>
                    <div className="text-xl font-bold text-zinc-100 font-mono">
                      {typeof val === 'boolean' ? (val ? 'DETECTED' : 'CLEAR') : String(val)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-Time SVG Telemetry Trend Chart */}
          <div className="dev-panel p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center space-x-2">
                <BarChart3 className="h-4 w-4 text-blue-400" />
                <h3 className="text-xs font-bold text-zinc-100">Telemetry Trend Stream</h3>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">Datapoints: {readings.length}</span>
            </div>

            {chartPoints ? (
              <div className="h-40 relative pt-2">
                <svg viewBox="0 0 750 150" className="w-full h-full overflow-visible">
                  <path d={chartPoints} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            ) : (
              <div className="h-32 flex flex-col items-center justify-center text-xs text-zinc-500">
                <Database className="h-5 w-5 text-zinc-600 mb-1" />
                <span>Waiting for telemetry stream...</span>
              </div>
            )}
          </div>

          {/* Device Information Card */}
          <div className="dev-panel p-5 space-y-4">
            <h3 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">
              Node Infrastructure Metadata
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-1">
                <span className="text-zinc-500 text-[10px]">DEVICE ID</span>
                <p className="text-zinc-200 font-bold">{device.id}</p>
              </div>

              <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-1">
                <span className="text-zinc-500 text-[10px]">FIRMWARE VERSION</span>
                <p className="text-zinc-200 font-bold">v1.0.0 (MQTT Hybrid)</p>
              </div>

              <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-1">
                <span className="text-zinc-500 text-[10px]">AUTH TOKEN</span>
                <div className="flex items-center justify-between text-blue-300">
                  <span className="truncate max-w-[140px]">{device.token}</span>
                  <button onClick={copyToken} className="hover:text-zinc-100">
                    {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TELEMETRY */}
      {activeTab === 'telemetry' && (
        <div className="dev-panel overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-100">Real-Time Ingestion Logs</h3>
            <span className="text-xs font-mono text-zinc-400">Total: {readings.length}</span>
          </div>
          <table className="w-full text-left dev-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Component</th>
                <th>Reading Type</th>
                <th>Value</th>
                <th>Raw Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs font-mono">
              {readings.slice(0, 30).map((r, idx) => (
                <tr key={idx} className="hover:bg-zinc-800/40">
                  <td className="text-zinc-400">{new Date(r.timestamp).toLocaleTimeString()}</td>
                  <td className="text-zinc-200 font-semibold">{r.component_type}</td>
                  <td>
                    <Badge variant="mono">{r.reading_type}</Badge>
                  </td>
                  <td className="text-emerald-400 font-bold">{r.value}</td>
                  <td className="text-zinc-500 truncate max-w-xs">{r.raw_data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: HARDWARE PINS */}
      {activeTab === 'hardware' && (
        <div className="dev-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-100">GPIO Component Pin Mappings</h3>
              <p className="text-xs text-zinc-400">Configured hardware sensors and output actuators</p>
            </div>
            <Link href={`/devices/${deviceId}/hardware`}>
              <Button variant="primary" size="sm" icon={<Sliders className="h-3.5 w-3.5" />}>
                Edit Pin Mappings
              </Button>
            </Link>
          </div>

          <div className="divide-y divide-zinc-800">
            {components.map((comp) => (
              <div key={comp.id} className="py-3 flex items-center justify-between font-mono text-xs">
                <div>
                  <div className="font-bold text-zinc-100">{comp.name}</div>
                  <div className="text-zinc-400 text-[11px]">{comp.type}</div>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge variant="mono">GPIO {comp.gpio_pin}</Badge>
                  {comp.gpio_secondary !== -1 && <Badge variant="mono">Echo GPIO {comp.gpio_secondary}</Badge>}
                  <Badge variant={comp.category === 'OUTPUT' ? 'info' : 'neutral'}>{comp.category}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: AUTOMATIONS */}
      {activeTab === 'automations' && (
        <div className="dev-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-bold text-zinc-100">Automation Rules for {device.name}</h3>
            <Link href="/automation">
              <Button variant="primary" size="sm" icon={<Zap className="h-3.5 w-3.5" />}>
                Rule Studio
              </Button>
            </Link>
          </div>

          <div className="divide-y divide-zinc-800">
            {rules.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500">No automation rules configured for this node.</div>
            ) : (
              rules.map((rule: any) => (
                <div key={rule.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-zinc-100">{rule.name}</div>
                    <div className="font-mono text-zinc-400 text-[11px] mt-0.5">
                      IF {rule.sensor_component} [{rule.condition}] {rule.trigger_value} ➔ SET {rule.action_component} = {rule.action_value}
                    </div>
                  </div>
                  <Badge variant={rule.is_active ? 'success' : 'neutral'}>
                    {rule.is_active ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: ACTUATOR COMMANDS */}
      {activeTab === 'commands' && (
        <div className="space-y-6">
          <div className="dev-panel p-5 space-y-4">
            <h3 className="text-sm font-bold text-zinc-100">Manual Actuator Controller</h3>
            <form onSubmit={handleSendCommand} className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-mono text-zinc-400 mb-1">Target GPIO Pin</label>
                <select
                  value={targetGpio}
                  onChange={(e) => setTargetGpio(Number(e.target.value))}
                  className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                >
                  {actuatorComponents.length > 0 ? (
                    actuatorComponents.map((c) => (
                      <option key={c.id} value={c.gpio_pin}>
                        GPIO {c.gpio_pin} ({c.name})
                      </option>
                    ))
                  ) : (
                    <option value={18}>GPIO 18 (Default LED)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-400 mb-1">Target Output State</label>
                <select
                  value={targetValue}
                  onChange={(e) => setTargetValue(Number(e.target.value))}
                  className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                >
                  <option value={1}>HIGH / TURN ON (1)</option>
                  <option value={0}>LOW / TURN OFF (0)</option>
                </select>
              </div>

              <div className="pt-5">
                <Button variant="primary" size="sm" type="submit" loading={commandSending} icon={<Send className="h-3.5 w-3.5" />}>
                  Dispatch Command
                </Button>
              </div>
            </form>
          </div>

          <div className="dev-panel overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h3 className="text-xs font-bold text-zinc-100">Dispatched Commands Audit Trail</h3>
            </div>
            <table className="w-full text-left dev-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>GPIO Pin</th>
                  <th>Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-xs font-mono">
                {commands.map((cmd) => (
                  <tr key={cmd.id}>
                    <td className="text-zinc-400">{new Date(cmd.created_at).toLocaleTimeString()}</td>
                    <td className="text-zinc-200">GPIO {cmd.gpio_pin}</td>
                    <td className="text-emerald-400 font-bold">{cmd.value === 1 ? 'HIGH (1)' : 'LOW (0)'}</td>
                    <td>
                      <Badge variant={cmd.status === 'EXECUTED' ? 'success' : 'warning'}>{cmd.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: LOGS */}
      {activeTab === 'logs' && (
        <div className="dev-panel p-4 bg-[#09090b] font-mono text-xs space-y-2">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-zinc-400">
            <span>Terminal Log Feed — {device.id}</span>
            <span className="text-emerald-400">● LIVE</span>
          </div>
          <div className="space-y-1 py-2 text-zinc-300">
            <p><span className="text-zinc-500">[{new Date().toLocaleTimeString()}]</span> <span className="text-blue-400">INFO</span> Device authenticated on LAN: {device.ip_address}</p>
            <p><span className="text-zinc-500">[{new Date().toLocaleTimeString()}]</span> <span className="text-blue-400">INFO</span> MQTT PubSubClient connected on port 1883</p>
            <p><span className="text-zinc-500">[{new Date().toLocaleTimeString()}]</span> <span className="text-emerald-400">SUCCESS</span> Ingested telemetry payload</p>
          </div>
        </div>
      )}

      {/* TAB 7: FIRMWARE */}
      {activeTab === 'firmware' && (
        <div className="dev-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-100">ESP32 Dynamic C++ Sketch Generator</h3>
              <p className="text-xs text-zinc-400">Generate, compile, and download sketch configured for this node</p>
            </div>
            <Link href={`/devices/${deviceId}/firmware`}>
              <Button variant="primary" size="sm" icon={<FileCode2 className="h-3.5 w-3.5" />}>
                Open Sketch Generator
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

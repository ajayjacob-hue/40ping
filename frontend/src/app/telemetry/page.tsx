'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { getBackendUrl, Device, Component } from '@/lib/api';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import {
  Activity,
  Cpu,
  Download,
  BarChart3,
  Database,
  Clock,
  CheckCircle2,
  TrendingUp,
  Filter,
  Sliders,
  Power,
  Zap,
  Lightbulb,
  Volume2,
  Plus
} from 'lucide-react';

interface TelemetryReading {
  id?: number;
  device_id: string;
  device_name?: string;
  component_type: string;
  reading_type: string;
  value: number;
  raw_data: string;
  timestamp: string;
}

export default function TelemetryPage() {
  const [readings, setReadings] = useState<TelemetryReading[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceComponents, setDeviceComponents] = useState<Component[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<string>('ALL');
  const [selectedMetric, setSelectedMetric] = useState<string>('ALL');
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('24h');
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [actuatorStates, setActuatorStates] = useState<Record<string, boolean>>({});
  const [commandSending, setCommandSending] = useState(false);

  const devicesRef = useRef<Device[]>(devices);
  const isLiveStreamingRef = useRef<boolean>(isLiveStreaming);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    isLiveStreamingRef.current = isLiveStreaming;
  }, [isLiveStreaming]);

  const backendUrl = getBackendUrl();

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true);
      const [readingsRes, devicesRes] = await Promise.all([
        axios.get(`${backendUrl}/api/telemetry?limit=200`),
        axios.get(`${backendUrl}/api/devices`),
      ]);

      setReadings(readingsRes.data.readings || []);
      setDevices(devicesRes.data.devices || []);
    } catch (err) {
      console.error('Failed to load telemetry data:', err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);

    const socket: Socket = io(backendUrl);

    socket.on('device_telemetry', (data: { deviceId: string; readings: Record<string, any>; timestamp: string }) => {
      if (!isLiveStreamingRef.current) return;

      const deviceObj = devicesRef.current.find((d) => d.id === data.deviceId);
      const deviceName = deviceObj ? deviceObj.name : data.deviceId;

      const newItems: TelemetryReading[] = [];
      for (const [key, val] of Object.entries(data.readings)) {
        if (key === 'token' || key === 'deviceId') continue;

        let numVal = typeof val === 'number' ? val : typeof val === 'boolean' ? (val ? 1 : 0) : parseFloat(String(val)) || 0;

        newItems.push({
          device_id: data.deviceId,
          device_name: deviceName,
          component_type: key.toUpperCase(),
          reading_type: key.toLowerCase(),
          value: numVal,
          raw_data: JSON.stringify({ [key]: val }),
          timestamp: data.timestamp || new Date().toISOString(),
        });
      }

      if (newItems.length > 0) {
        setReadings((prev) => [...newItems, ...prev].slice(0, 200));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [backendUrl]);

  useEffect(() => {
    const fetchComponents = async () => {
      const targetId = selectedDevice !== 'ALL' ? selectedDevice : devices[0]?.id;
      if (!targetId) {
        setDeviceComponents([]);
        return;
      }
      try {
        const res = await axios.get(`${backendUrl}/api/devices/${targetId}`);
        setDeviceComponents(res.data.components || []);
      } catch (err) {
        console.error('Failed to fetch components for target device:', err);
      }
    };
    fetchComponents();
  }, [selectedDevice, devices, backendUrl]);

  const outputActuators = useMemo(() => {
    if (deviceComponents.length > 0) {
      const outputs = deviceComponents.filter((c) => c.category === 'OUTPUT' || ['LED', 'BUZZER', 'RELAY', 'GENERIC_OUTPUT'].includes(c.type));
      if (outputs.length > 0) {
        return outputs.map((c) => ({
          pin: c.gpio_pin,
          name: c.name,
          type: c.type,
          icon: c.type === 'LED' ? Lightbulb : c.type === 'BUZZER' ? Volume2 : c.type === 'RELAY' ? Power : Zap,
          color: c.type === 'LED' ? 'text-amber-400' : c.type === 'BUZZER' ? 'text-blue-400' : c.type === 'RELAY' ? 'text-emerald-400' : 'text-purple-400',
        }));
      }
    }
    return [
      { pin: 2, name: 'Status Indicator LED', type: 'LED', icon: Lightbulb, color: 'text-amber-400' },
      { pin: 18, name: 'External LED Light', type: 'LED', icon: Lightbulb, color: 'text-amber-400' },
      { pin: 19, name: 'Audio Buzzer Alarm', type: 'BUZZER', icon: Volume2, color: 'text-blue-400' },
      { pin: 25, name: 'Power Relay Switch', type: 'RELAY', icon: Power, color: 'text-emerald-400' },
    ];
  }, [deviceComponents]);

  // Filtered readings list
  const filteredReadings = useMemo(() => {
    return readings.filter((r) => {
      if (selectedDevice !== 'ALL' && r.device_id !== selectedDevice) return false;
      if (selectedMetric !== 'ALL' && r.reading_type.toLowerCase() !== selectedMetric.toLowerCase()) return false;
      return true;
    });
  }, [readings, selectedDevice, selectedMetric]);

  // Telemetry Metric Stats Math
  const metricStats = useMemo(() => {
    if (filteredReadings.length === 0) return { min: 0, max: 0, avg: 0, current: 0, lastUpdated: 'Never' };
    const vals = filteredReadings.map((r) => Number(r.value)).filter((v) => !isNaN(v));
    if (vals.length === 0) return { min: 0, max: 0, avg: 0, current: 0, lastUpdated: 'Never' };

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const lastUpdated = new Date(filteredReadings[0].timestamp).toLocaleTimeString();

    return {
      min: parseFloat(min.toFixed(1)),
      max: parseFloat(max.toFixed(1)),
      avg: parseFloat(avg.toFixed(1)),
      current: parseFloat(vals[0].toFixed(1)),
      lastUpdated,
    };
  }, [filteredReadings]);

  const availableMetrics = useMemo(() => {
    const set = new Set<string>();
    readings.forEach((r) => {
      if (r.reading_type) set.add(r.reading_type.toLowerCase());
    });
    return Array.from(set);
  }, [readings]);

  // SVG Chart Curve Generator - filters to specific metric so trend line is 100% accurate
  const chartPath = useMemo(() => {
    const targetMetric = selectedMetric !== 'ALL' 
      ? selectedMetric.toLowerCase() 
      : (availableMetrics.find((m) => m !== 'status' && m !== 'uptime_sec') || availableMetrics[0] || 'temperature');

    const list = [...readings]
      .filter((r) => {
        if (selectedDevice !== 'ALL' && r.device_id !== selectedDevice) return false;
        return r.reading_type.toLowerCase() === targetMetric;
      })
      .reverse();

    if (list.length < 2) return { path: '', area: '', metricName: targetMetric, pointsCount: list.length };

    const width = 800;
    const height = 180;
    const vals = list.map((r) => Number(r.value) || 0);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;

    const points = list.map((item, idx) => {
      const x = (idx / (list.length - 1)) * width;
      const y = height - (((Number(item.value) || 0) - min) / range) * (height - 20) - 10;
      return `${x},${y}`;
    });

    const path = `M ${points.join(' L ')}`;
    const area = `${path} L ${width},${height} L 0,${height} Z`;
    return { path, area, metricName: targetMetric, pointsCount: list.length };
  }, [readings, selectedDevice, selectedMetric, availableMetrics]);

  // CSV Export Handler
  const exportCsv = () => {
    if (filteredReadings.length === 0) return;

    const headers = ['Timestamp', 'Device ID', 'Device Name', 'Component', 'Reading Type', 'Value', 'Raw Data'];
    const rows = filteredReadings.map((r) => [
      `"${r.timestamp}"`,
      `"${r.device_id}"`,
      `"${r.device_name || r.device_id}"`,
      `"${r.component_type}"`,
      `"${r.reading_type}"`,
      r.value,
      `"${r.raw_data.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `iot_telemetry_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleActuator = async (targetDeviceId: string, gpioPin: number, currentVal: boolean) => {
    try {
      setCommandSending(true);
      const nextVal = currentVal ? 0 : 1;
      await axios.post(`${backendUrl}/api/devices/${targetDeviceId}/commands`, {
        command_type: 'GPIO_WRITE',
        gpio_pin: gpioPin,
        value: nextVal,
      });
      setActuatorStates((prev) => ({ ...prev, [`${targetDeviceId}_${gpioPin}`]: !currentVal }));
    } catch (err) {
      console.error('Failed to dispatch output command:', err);
      alert('Failed to dispatch command to hardware node.');
    } finally {
      setCommandSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Telemetry Stream Console</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Ingest, filter, and analyze real-time hardware telemetry streams.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant={isLiveStreaming ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setIsLiveStreaming(!isLiveStreaming)}
          >
            {isLiveStreaming ? '● Pause Stream' : '▶ Resume Stream'}
          </Button>
          <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Metric Callouts (Current, Min, Max, Avg, Last Updated) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="dev-card p-3 font-mono space-y-1">
          <span className="text-[10px] text-zinc-500 block font-sans font-semibold">CURRENT VALUE</span>
          <span className="text-xl font-bold text-zinc-100">{metricStats.current}</span>
        </div>
        <div className="dev-card p-3 font-mono space-y-1">
          <span className="text-[10px] text-zinc-500 block font-sans font-semibold">MIN VALUE</span>
          <span className="text-xl font-bold text-zinc-300">{metricStats.min}</span>
        </div>
        <div className="dev-card p-3 font-mono space-y-1">
          <span className="text-[10px] text-zinc-500 block font-sans font-semibold">MAX VALUE</span>
          <span className="text-xl font-bold text-zinc-300">{metricStats.max}</span>
        </div>
        <div className="dev-card p-3 font-mono space-y-1">
          <span className="text-[10px] text-zinc-500 block font-sans font-semibold">AVERAGE</span>
          <span className="text-xl font-bold text-blue-400">{metricStats.avg}</span>
        </div>
        <div className="dev-card p-3 font-mono space-y-1">
          <span className="text-[10px] text-zinc-500 block font-sans font-semibold">LAST UPDATED</span>
          <span className="text-xs font-bold text-emerald-400">{metricStats.lastUpdated}</span>
        </div>
      </div>

      {/* Controls & Graph Panel */}
      <div className="dev-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-bold text-zinc-100">
              Historical & Live <span className="text-blue-400 capitalize">{chartPath.metricName}</span> Trend Curve
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Device Filter */}
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded px-2.5 py-1 focus:outline-none"
            >
              <option value="ALL">All Nodes ({devices.length})</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.id})
                </option>
              ))}
            </select>

            {/* Metric Selector */}
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded px-2.5 py-1 focus:outline-none"
            >
              <option value="ALL">All Metrics</option>
              <option value="temperature">Temperature (°C)</option>
              <option value="humidity">Humidity (%)</option>
              <option value="motion">Motion</option>
              <option value="distance">Distance (cm)</option>
              <option value="light">Light LDR</option>
            </select>

            {/* Time Range Selector */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 font-mono text-[11px]">
              {['1h', '24h', '7d', '30d'].map((range) => (
                <button
                  key={range}
                  onClick={() => setSelectedTimeRange(range)}
                  className={`px-2 py-0.5 rounded ${
                    selectedTimeRange === range ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SVG Trend Stream Curve */}
        {filteredReadings.length < 2 ? (
          <div className="h-44 flex flex-col items-center justify-center text-xs text-zinc-500 space-y-1">
            <Database className="h-6 w-6 text-zinc-600 mb-1" />
            <span>Ingesting telemetry payload...</span>
          </div>
        ) : (
          <div className="relative w-full h-48 pt-2">
            <svg viewBox="0 0 800 180" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="telemetryAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="20" x2="800" y2="20" stroke="#27272a" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="800" y2="90" stroke="#27272a" strokeDasharray="3 3" />
              <line x1="0" y1="160" x2="800" y2="160" stroke="#27272a" strokeDasharray="3 3" />

              {chartPath.area && <path d={chartPath.area} fill="url(#telemetryAreaGrad)" />}
              {chartPath.path && (
                <path d={chartPath.path} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </div>
        )}
      </div>

      {/* Hardware Output Actuator Controller Panel */}
      <div className="dev-panel p-5 space-y-4 bg-[#121215] border border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <Sliders className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-bold text-zinc-100">Live Hardware Actuator Output Controller</h2>
          </div>
          <span className="text-xs font-mono text-zinc-400">Target Node: {selectedDevice}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {outputActuators.map((actuator) => {
            const targetDev = selectedDevice !== 'ALL' ? selectedDevice : (devices[0]?.id || 'ESP32-A7F92');
            const isOn = Boolean(actuatorStates[`${targetDev}_${actuator.pin}`]);
            const Icon = actuator.icon;

            return (
              <div key={actuator.pin} className="dev-card p-3 font-mono flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <Icon className={`h-4 w-4 ${isOn ? actuator.color : 'text-zinc-500'}`} />
                    <span className="text-xs font-bold text-zinc-200">{actuator.name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 block">GPIO Pin {actuator.pin}</span>
                </div>

                <Button
                  variant={isOn ? 'primary' : 'outline'}
                  size="sm"
                  disabled={commandSending}
                  onClick={() => handleToggleActuator(targetDev, actuator.pin, isOn)}
                >
                  {isOn ? 'HIGH (1)' : 'LOW (0)'}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Telemetry Stream Data Table */}
      <div className="dev-panel overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-xs font-bold text-zinc-100">Telemetry Data Stream Table</h2>
          <span className="text-xs font-mono text-zinc-400">Total Datapoints: {filteredReadings.length}</span>
        </div>

        {initialLoading ? (
          <div className="p-8 text-center text-xs text-zinc-400">Loading telemetry data stream...</div>
        ) : filteredReadings.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No Telemetry Data Ingested"
            description="Hardware devices send telemetry every 2 seconds. Ensure an ESP32 is powered and connected."
          />
        ) : (
          <table className="w-full text-left dev-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Device ID</th>
                <th>Component</th>
                <th>Reading Type</th>
                <th>Value</th>
                <th>Raw JSON Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs font-mono">
              {filteredReadings.slice(0, 50).map((r, idx) => (
                <tr key={idx} className="hover:bg-zinc-800/40">
                  <td className="text-zinc-400">{new Date(r.timestamp).toLocaleTimeString()}</td>
                  <td className="text-zinc-200">{r.device_id}</td>
                  <td className="text-zinc-100 font-semibold">{r.component_type}</td>
                  <td>
                    <Badge variant="mono">{r.reading_type}</Badge>
                  </td>
                  <td className="text-emerald-400 font-bold">{r.value}</td>
                  <td className="text-zinc-500 truncate max-w-xs">{r.raw_data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

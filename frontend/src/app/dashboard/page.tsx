'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import ServerIpCard from '@/components/ServerIpCard';
import StatusDot from '@/components/ui/StatusDot';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Cpu, Activity, Zap, Plus, ArrowRight, CheckCircle2, BarChart3, Database } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, Device } from '@/lib/api';
import { io, Socket } from 'socket.io-client';

interface TelemetryPoint {
  value: number;
  type: string;
  time: string;
}

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [telemetryCount, setTelemetryCount] = useState<number>(0);
  const [activeRulesCount, setActiveRulesCount] = useState<number>(0);
  const [readingsList, setReadingsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<string>('temperature');
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('24h');

  const backendUrl = getBackendUrl();

  const fetchDashboardData = async () => {
    try {
      const [devRes, autoRes, telemRes, statsRes] = await Promise.all([
        axios.get(`${backendUrl}/api/devices`),
        axios.get(`${backendUrl}/api/automations`).catch(() => ({ data: { rules: [] } })),
        axios.get(`${backendUrl}/api/telemetry?limit=150`).catch(() => ({ data: { readings: [] } })),
        axios.get(`${backendUrl}/api/telemetry/stats`).catch(() => ({ data: { totalReadings: 0 } })),
      ]);

      const devList = devRes.data.devices || [];
      setDevices(devList);
      setActiveRulesCount((autoRes.data.rules || []).filter((r: any) => r.is_active).length);
      setReadingsList(telemRes.data.readings || []);
      setTelemetryCount(statsRes.data.totalReadings || (telemRes.data.readings || []).length);
    } catch (err) {
      console.error('Failed to load dashboard console data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Setup Socket.IO for real-time live telemetry & heartbeat pings
    const socket: Socket = io(backendUrl);

    socket.on('device_heartbeat', (data: { deviceId: string; status: string; ipAddress?: string }) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId ? { ...d, status: data.status as 'ONLINE' | 'OFFLINE', ip_address: data.ipAddress || d.ip_address } : d))
      );
    });

    socket.on('device_telemetry', (data: { deviceId: string; readings: Record<string, any> }) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId ? { ...d, status: 'ONLINE' } : d))
      );
      setTelemetryCount((prev) => prev + Object.keys(data.readings || {}).length);
    });

    socket.on('device_created', (newDevice: Device) => {
      setDevices((prev) => [newDevice, ...prev.filter((d) => d.id !== newDevice.id)]);
    });

    socket.on('device_deleted', (data: { deviceId: string }) => {
      setDevices((prev) => prev.filter((d) => d.id !== data.deviceId));
    });

    return () => {
      socket.disconnect();
    };
  }, [backendUrl]);

  const onlineCount = devices.filter((d) => d.status === 'ONLINE').length;
  const offlineCount = devices.length - onlineCount;

  // Filter telemetry readings for graph by metric
  const metricReadings = useMemo(() => {
    const list = readingsList.filter(
      (r) => r.reading_type && r.reading_type.toLowerCase() === selectedMetric.toLowerCase()
    );
    if (list.length === 0) return readingsList.slice(0, 30);
    return list;
  }, [readingsList, selectedMetric]);

  // Metric Math Stats (Min, Max, Avg, Current)
  const metricStats = useMemo(() => {
    if (metricReadings.length === 0) return { min: 0, max: 0, avg: 0, current: 0 };
    const vals = metricReadings.map((r) => Number(r.value)).filter((v) => !isNaN(v));
    if (vals.length === 0) return { min: 0, max: 0, avg: 0, current: 0 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      min: parseFloat(min.toFixed(1)),
      max: parseFloat(max.toFixed(1)),
      avg: parseFloat(avg.toFixed(1)),
      current: parseFloat(vals[0].toFixed(1)),
    };
  }, [metricReadings]);

  // Generate SVG Path for Trend Graph
  const chartPath = useMemo(() => {
    const list = [...metricReadings].reverse();
    if (list.length < 2) return { path: '', area: '' };
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
    return { path, area };
  }, [metricReadings]);

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Infrastructure Overview</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time telemetry stream, connected hardware nodes, and edge automation metrics.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/devices">
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
              Register Device
            </Button>
          </Link>
        </div>
      </div>

      {/* Top Infrastructure Console Overview Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Devices */}
        <div className="dev-card p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-semibold text-zinc-300">Devices</span>
            <Cpu className="h-4 w-4 text-zinc-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-100">{devices.length} total</div>
            <div className="flex items-center space-x-3 text-xs mt-1">
              <span className="text-emerald-400 font-medium">{onlineCount} online</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400">{offlineCount} offline</span>
            </div>
          </div>
        </div>

        {/* Card 2: Telemetry */}
        <div className="dev-card p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-semibold text-zinc-300">Telemetry Volume</span>
            <Activity className="h-4 w-4 text-zinc-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-100">
              {telemetryCount > 1000 ? `${(telemetryCount / 1000).toFixed(1)}k` : telemetryCount}
            </div>
            <div className="text-xs text-zinc-400 mt-1">Readings ingested / 24h</div>
          </div>
        </div>

        {/* Card 3: Automations */}
        <div className="dev-card p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-semibold text-zinc-300">Edge Rules</span>
            <Zap className="h-4 w-4 text-zinc-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-100">{activeRulesCount} active</div>
            <div className="text-xs text-emerald-400 mt-1">IFTTT Engine Active</div>
          </div>
        </div>

        {/* Card 4: System Status */}
        <div className="dev-card p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-semibold text-zinc-300">System Status</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-emerald-400 flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Operational</span>
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-mono">LAN Gateway Active</div>
          </div>
        </div>
      </div>

      {/* Local Gateway IPv4 Card */}
      <ServerIpCard />

      {/* Meaningful Telemetry Trend Visualization */}
      <div className="dev-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-bold text-zinc-100">Telemetry Stream Analytics</h2>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">Real-time sensor data graph over recent time ranges</p>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            {/* Metric Selector */}
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded-md px-2.5 py-1 focus:outline-none"
            >
              <option value="temperature">Temperature (°C)</option>
              <option value="humidity">Humidity (%)</option>
              <option value="motion">Motion Ingestion</option>
              <option value="distance">Ultrasonic Distance</option>
              <option value="light">Light LDR</option>
            </select>

            {/* Time Range Selector */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-0.5 font-mono text-[11px]">
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

        {/* Callouts (Min, Max, Avg, Current) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80 text-xs font-mono">
          <div>
            <span className="text-zinc-500 block text-[10px]">CURRENT VALUE</span>
            <span className="text-sm font-bold text-zinc-100">{metricStats.current}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">MIN VALUE</span>
            <span className="text-sm font-bold text-zinc-300">{metricStats.min}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">MAX VALUE</span>
            <span className="text-sm font-bold text-zinc-300">{metricStats.max}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">AVERAGE</span>
            <span className="text-sm font-bold text-blue-400">{metricStats.avg}</span>
          </div>
        </div>

        {/* SVG Curve */}
        {metricReadings.length < 2 ? (
          <div className="h-44 flex flex-col items-center justify-center text-zinc-500 text-xs space-y-1">
            <Database className="h-6 w-6 text-zinc-600 mb-1" />
            <p>Ingesting real-time sensor stream...</p>
          </div>
        ) : (
          <div className="relative w-full h-44 pt-2">
            <svg viewBox="0 0 800 180" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="dashboardAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="20" x2="800" y2="20" stroke="#27272a" strokeDasharray="3 3" />
              <line x1="0" y1="90" x2="800" y2="90" stroke="#27272a" strokeDasharray="3 3" />
              <line x1="0" y1="160" x2="800" y2="160" stroke="#27272a" strokeDasharray="3 3" />

              {chartPath.area && <path d={chartPath.area} fill="url(#dashboardAreaGrad)" />}
              {chartPath.path && (
                <path d={chartPath.path} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </div>
        )}
      </div>

      {/* Recent Connected Hardware Nodes Table */}
      <div className="dev-panel overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-100">Registered Nodes Overview</h2>
            <p className="text-xs text-zinc-400">Connected ESP32 hardware infrastructure</p>
          </div>
          <Link href="/devices" className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center space-x-1">
            <span>View All Devices</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-xs text-zinc-400">Loading nodes registry...</div>
          ) : devices.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Cpu className="h-8 w-8 text-zinc-600 mx-auto" />
              <h3 className="text-sm font-medium text-zinc-300">No Devices Registered Yet</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Register your ESP32 device to start ingesting telemetry and controlling hardware outputs.
              </p>
              <Link href="/devices">
                <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
                  Register First Device
                </Button>
              </Link>
            </div>
          ) : (
            <table className="w-full text-left dev-table">
              <thead>
                <tr>
                  <th>Device Name</th>
                  <th>Device ID</th>
                  <th>Status</th>
                  <th>IP Address</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-xs">
                {devices.map((device) => (
                  <tr key={device.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="font-semibold text-zinc-100">
                      <Link href={`/devices/${device.id}`} className="hover:text-blue-400">
                        {device.name}
                      </Link>
                    </td>
                    <td className="font-mono text-zinc-400 text-[11px]">{device.id}</td>
                    <td>
                      <StatusDot status={device.status} />
                    </td>
                    <td className="font-mono text-zinc-400 text-[11px]">{device.ip_address || '---'}</td>
                    <td className="text-right space-x-1.5">
                      <Link href={`/devices/${device.id}`}>
                        <Button variant="outline" size="sm">
                          Console
                        </Button>
                      </Link>
                      <Link href={`/devices/${device.id}/hardware`}>
                        <Button variant="secondary" size="sm">
                          GPIO Pins
                        </Button>
                      </Link>
                      <Link href={`/devices/${device.id}/firmware`}>
                        <Button variant="outline" size="sm">
                          Firmware
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

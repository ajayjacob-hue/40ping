'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ServerIpCard from '@/components/ServerIpCard';
import { Cpu, Activity, Zap, Plus, ArrowRight, CheckCircle2, Terminal } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, Device } from '@/lib/api';

import { io, Socket } from 'socket.io-client';

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await axios.get(`${getBackendUrl()}/api/devices`);
        setDevices(res.data.devices || []);
      } catch (err) {
        console.error('Failed to load devices:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDevices();

    // Setup Real-Time Socket.IO connection for live device pings & telemetry
    const socket: Socket = io(getBackendUrl());

    socket.on('device_heartbeat', (data: { deviceId: string; status: string; ipAddress?: string }) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId ? { ...d, status: data.status as 'ONLINE' | 'OFFLINE', ip_address: data.ipAddress || d.ip_address } : d))
      );
    });

    socket.on('device_telemetry', (data: { deviceId: string }) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === data.deviceId ? { ...d, status: 'ONLINE' } : d))
      );
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
  }, []);

  const onlineCount = devices.filter(d => d.status === 'ONLINE').length;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            Local ESP32 hardware network monitoring & automation hub.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href="/devices"
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg glow-blue"
          >
            <Plus className="h-4 w-4" />
            <span>+ Add Device</span>
          </Link>
        </div>
      </div>

      {/* Laptop LAN Server IP Card */}
      <ServerIpCard />

      {/* Metrics Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex items-center space-x-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Registered Devices</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">{devices.length}</h3>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex items-center space-x-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Online ESP32 Nodes</p>
            <h3 className="text-2xl font-bold text-emerald-400 mt-0.5">{onlineCount}</h3>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex items-center space-x-4">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Real-Time Polling</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">1000 ms</h3>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-gray-800 flex items-center space-x-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Automation Mode</p>
            <h3 className="text-2xl font-bold text-amber-400 mt-0.5">ACTIVE</h3>
          </div>
        </div>
      </div>

      {/* Devices Overview Table */}
      <div className="glass-panel rounded-2xl border border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Configured Devices</h2>
            <p className="text-xs text-gray-400 mt-0.5">Manage hardware configurations, view telemetry, and flash firmware</p>
          </div>
          <Link href="/devices" className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center space-x-1">
            <span>View All</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading device registry...</div>
          ) : devices.length === 0 ? (
            <div className="p-12 text-center">
              <Cpu className="h-12 w-12 text-gray-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-300">No Devices Registered Yet</h3>
              <p className="text-xs text-gray-400 mt-1 mb-4">Register your physical ESP32 device to start monitoring telemetry.</p>
              <Link
                href="/devices"
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium"
              >
                <Plus className="h-4 w-4" />
                <span>Add First Device</span>
              </Link>
            </div>
          ) : (
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900/60 text-xs uppercase font-medium text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="px-6 py-3.5">Device Name</th>
                  <th className="px-6 py-3.5">Device ID</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Device IP</th>
                  <th className="px-6 py-3.5 text-right">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {devices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white">
                      <Link href={`/devices/${device.id}`} className="hover:text-blue-400">
                        {device.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-blue-300">{device.id}</td>
                    <td className="px-6 py-4">
                      {device.status === 'ONLINE' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5"></span>
                          ONLINE
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                          OFFLINE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-400">{device.ip_address || '---'}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Link
                        href={`/devices/${device.id}`}
                        className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-600/30"
                      >
                        Telemetry
                      </Link>
                      <Link
                        href={`/devices/${device.id}/hardware`}
                        className="px-3 py-1.5 bg-gray-800 text-gray-300 border border-gray-700 rounded-lg text-xs font-medium hover:bg-gray-700"
                      >
                        Pins
                      </Link>
                      <Link
                        href={`/devices/${device.id}/firmware`}
                        className="px-3 py-1.5 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-medium hover:bg-purple-600/30"
                      >
                        Firmware
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

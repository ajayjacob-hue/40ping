'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cpu, Plus, Key, ShieldCheck, Copy, Check, Trash2, ArrowRight, X } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, Device } from '@/lib/api';

import { io, Socket } from 'socket.io-client';

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [createdDevice, setCreatedDevice] = useState<{ device: Device; serverIp: string; serverPort: number } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

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

  useEffect(() => {
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

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceNameInput.trim()) return;

    try {
      const res = await axios.post(`${getBackendUrl()}/api/devices`, {
        name: deviceNameInput.trim(),
      });

      setCreatedDevice(res.data);
      setDeviceNameInput('');
      fetchDevices();
    } catch (err) {
      alert('Failed to register device.');
    }
  };

  const handleDeleteDevice = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete device "${name}" (${id})?`)) return;
    try {
      await axios.delete(`${getBackendUrl()}/api/devices/${id}`);
      fetchDevices();
    } catch (err) {
      alert('Failed to delete device.');
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Devices Management</h1>
          <p className="text-sm text-gray-400 mt-1">
            Register physical ESP32 nodes and configure custom hardware pin mappings.
          </p>
        </div>

        <button
          onClick={() => {
            setCreatedDevice(null);
            setShowAddModal(true);
          }}
          className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg glow-blue"
        >
          <Plus className="h-4 w-4" />
          <span>+ Add Device</span>
        </button>
      </div>

      {/* Device Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full p-8 text-center text-sm text-gray-400">Loading devices...</div>
        ) : devices.length === 0 ? (
          <div className="col-span-full glass-panel p-12 rounded-2xl border border-gray-800 text-center">
            <Cpu className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-200">No ESP32 Devices Configured</h3>
            <p className="text-xs text-gray-400 max-w-md mx-auto mt-1 mb-6">
              Click "+ Add Device" to register your ESP32. The system will auto-generate a unique Device ID and authentication token.
            </p>
            <button
              onClick={() => {
                setCreatedDevice(null);
                setShowAddModal(true);
              }}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              <span>Register First Device</span>
            </button>
          </div>
        ) : (
          devices.map((device) => (
            <div
              key={device.id}
              className="glass-panel p-6 rounded-2xl border border-gray-800 hover:border-gray-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl">
                      <Cpu className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">{device.name}</h3>
                      <p className="text-xs font-mono text-blue-300 mt-0.5">{device.id}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteDevice(device.id, device.name)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                    title="Delete device"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Connection Status:</span>
                    {device.status === 'ONLINE' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse mr-1"></span>
                        ONLINE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-800 text-gray-400">
                        OFFLINE
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Device IP:</span>
                    <span className="font-mono text-gray-300">{device.ip_address || 'Not Connected'}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Token:</span>
                    <div className="flex items-center space-x-1 font-mono text-[11px] text-gray-400">
                      <span>{device.token.substring(0, 8)}...</span>
                      <button onClick={() => copyToken(device.token)} className="text-gray-500 hover:text-gray-300">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-gray-800/80 grid grid-cols-2 gap-2">
                <Link
                  href={`/devices/${device.id}`}
                  className="px-3 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-medium text-center hover:bg-blue-600/30 transition-colors"
                >
                  Telemetry Dashboard
                </Link>
                <Link
                  href={`/devices/${device.id}/hardware`}
                  className="px-3 py-2 bg-gray-800 text-gray-300 border border-gray-700 rounded-xl text-xs font-medium text-center hover:bg-gray-700 transition-colors"
                >
                  Hardware Pins
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Device Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-gray-700 p-6 shadow-2xl space-y-6">
            {!createdDevice ? (
              <>
                <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
                      <Cpu className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">Add New Device</h3>
                      <p className="text-xs text-gray-400">Register a new ESP32 microcontroller node</p>
                    </div>
                  </div>
                  <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateDevice} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                      Device Name (e.g. Smart Room, Living Lab)
                    </label>
                    <input
                      type="text"
                      required
                      value={deviceNameInput}
                      onChange={(e) => setDeviceNameInput(e.target.value)}
                      placeholder="Smart Room"
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-xl text-xs text-blue-300">
                    <p className="font-semibold flex items-center">
                      <ShieldCheck className="h-4 w-4 mr-1 text-blue-400" /> Auto-Generated Setup
                    </p>
                    <p className="text-gray-400 text-[11px] mt-0.5">
                      The backend will assign a Device ID, generate a secure secret token, and pre-load demo GPIO pin mappings (DHT11 → 4, PIR → 5, LED → 18).
                    </p>
                  </div>

                  <div className="flex justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 bg-gray-800 text-gray-300 rounded-xl text-xs font-medium hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium shadow-md glow-blue"
                    >
                      Generate Device Credentials
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* Created Credentials Summary Screen */
              <div className="space-y-5">
                <div className="flex items-center space-x-3 border-b border-gray-800 pb-4">
                  <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">Device Credentials Generated</h3>
                    <p className="text-xs text-emerald-400 font-medium">Use these values in your ESP32 code</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-gray-900 rounded-xl border border-gray-800 space-y-1">
                    <span className="text-gray-400 block font-medium">Device Name:</span>
                    <span className="text-white font-bold text-sm">{createdDevice.device.name}</span>
                  </div>

                  <div className="p-3 bg-gray-900 rounded-xl border border-gray-800 space-y-1">
                    <span className="text-gray-400 block font-medium">Device ID:</span>
                    <span className="text-blue-300 font-mono text-sm font-bold">{createdDevice.device.id}</span>
                  </div>

                  <div className="p-3 bg-gray-900 rounded-xl border border-gray-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 font-medium">Device Token:</span>
                      <button
                        onClick={() => copyToken(createdDevice.device.token)}
                        className="text-blue-400 hover:text-blue-300 text-[11px] flex items-center space-x-1"
                      >
                        {copiedToken ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <span className="text-amber-300 font-mono text-xs break-all block">{createdDevice.device.token}</span>
                  </div>

                  <div className="p-3 bg-gray-900 rounded-xl border border-gray-800 space-y-1">
                    <span className="text-gray-400 block font-medium">ESP32 Server Address:</span>
                    <span className="text-emerald-400 font-mono text-xs font-bold">
                      http://{createdDevice.serverIp}:{createdDevice.serverPort}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <Link
                    href={`/devices/${createdDevice.device.id}/firmware`}
                    onClick={() => setShowAddModal(false)}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold text-center shadow-lg glow-blue flex items-center justify-center space-x-2"
                  >
                    <span>Download Pre-filled ESP32 .ino Firmware</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  <button
                    onClick={() => setShowAddModal(false)}
                    className="w-full py-2 bg-gray-800 text-gray-300 rounded-xl text-xs font-medium hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

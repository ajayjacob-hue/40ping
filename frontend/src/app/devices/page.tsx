'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import StatusDot from '@/components/ui/StatusDot';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { Cpu, Plus, Search, Trash2, Key, Check, Copy, X } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, Device } from '@/lib/api';
import { io, Socket } from 'socket.io-client';

function DevicesContent() {
  const searchParams = useSearchParams();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE' | 'WARNING'>('ALL');

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [createdDevice, setCreatedDevice] = useState<{ device: Device; serverIp: string; serverPort: number } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const backendUrl = getBackendUrl();

  useEffect(() => {
    if (searchParams.get('new') === 'true' || searchParams.get('action') === 'add') {
      setShowAddModal(true);
    }
  }, [searchParams]);

  const fetchDevices = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/devices`);
      setDevices(res.data.devices || []);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();

    const socket: Socket = io(backendUrl);

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
  }, [backendUrl]);

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceNameInput.trim()) return;

    try {
      const res = await axios.post(`${backendUrl}/api/devices`, {
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
      await axios.delete(`${backendUrl}/api/devices/${id}`);
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

  // Filtered devices list
  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const matchesSearch =
        device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (device.ip_address && device.ip_address.includes(searchQuery));

      if (!matchesSearch) return false;

      if (activeFilter === 'ONLINE') return device.status === 'ONLINE';
      if (activeFilter === 'OFFLINE') return device.status === 'OFFLINE';
      if (activeFilter === 'WARNING') return device.status === 'OFFLINE';
      return true;
    });
  }, [devices, searchQuery, activeFilter]);

  const counts = useMemo(() => {
    return {
      all: devices.length,
      online: devices.filter((d) => d.status === 'ONLINE').length,
      offline: devices.filter((d) => d.status === 'OFFLINE').length,
    };
  }, [devices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Hardware Node Registry</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage your connected ESP32 hardware infrastructure and pin configurations.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            setCreatedDevice(null);
            setShowAddModal(true);
          }}
        >
          Register Device
        </Button>
      </div>

      {/* Search and Filter Controls */}
      <div className="dev-panel p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center space-x-1 font-mono text-xs">
          {[
            { id: 'ALL', label: 'All', count: counts.all },
            { id: 'ONLINE', label: 'Online', count: counts.online },
            { id: 'OFFLINE', label: 'Offline', count: counts.offline },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`px-3 py-1 rounded-md transition-colors flex items-center space-x-1.5 ${
                activeFilter === tab.id
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] text-zinc-500 font-normal">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, name, or IP..."
            className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-md pl-8 pr-3 py-1.5 focus:outline-none focus:border-zinc-700 font-sans"
          />
        </div>
      </div>

      {/* Devices Data Table */}
      <div className="dev-panel overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-400">Loading hardware device registry...</div>
        ) : filteredDevices.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title={searchQuery ? 'No matching devices found' : 'No Devices Registered Yet'}
            description={
              searchQuery
                ? 'Try adjusting your search or status filter query.'
                : 'Register your physical ESP32 device to start ingesting telemetry and controlling GPIO outputs.'
            }
            actionLabel={searchQuery ? undefined : 'Register Device'}
            onAction={
              searchQuery
                ? undefined
                : () => {
                    setCreatedDevice(null);
                    setShowAddModal(true);
                  }
            }
          />
        ) : (
          <table className="w-full text-left dev-table">
            <thead>
              <tr>
                <th>Device Name</th>
                <th>Device ID</th>
                <th>Status</th>
                <th>IP Address</th>
                <th>Firmware</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs">
              {filteredDevices.map((device) => (
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
                  <td>
                    <Badge variant="mono">v1.0.0</Badge>
                  </td>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDevice(device.id, device.name)}
                      title="Delete Device"
                      className="text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Register Device Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="dev-panel w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Cpu className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold text-zinc-100">Register ESP32 Hardware Node</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-100 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!createdDevice ? (
              <form onSubmit={handleCreateDevice} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Device Name / Location Label
                  </label>
                  <input
                    type="text"
                    value={deviceNameInput}
                    onChange={(e) => setDeviceNameInput(e.target.value)}
                    placeholder="e.g. Smart Room Sensor or Greenhouse Node"
                    className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded-md p-2.5 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
                  <Button variant="outline" size="sm" type="button" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit">
                    Generate Credentials
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md text-xs">
                  ✓ Hardware device registered successfully!
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">Assigned Device ID</span>
                  <div className="p-2 bg-zinc-900 border border-zinc-800 rounded font-mono text-xs text-zinc-200">
                    {createdDevice.device.id}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase">Secure Auth Token</span>
                  <div className="p-2 bg-zinc-900 border border-zinc-800 rounded font-mono text-xs text-blue-300 flex items-center justify-between">
                    <span className="truncate pr-2">{createdDevice.device.token}</span>
                    <button
                      onClick={() => copyToken(createdDevice.device.token)}
                      className="p-1 hover:text-zinc-100 text-zinc-400"
                    >
                      {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
                  <Link href={`/devices/${createdDevice.device.id}/firmware`}>
                    <Button variant="primary" size="sm">
                      View C++ Firmware
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={<div className="dev-panel p-8 text-center text-xs text-zinc-400">Loading devices registry...</div>}>
      <DevicesContent />
    </Suspense>
  );
}

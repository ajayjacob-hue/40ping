'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Cpu,
  Thermometer,
  Droplets,
  Activity,
  Zap,
  Power,
  Volume2,
  Sliders,
  Clock,
  Wifi,
  Settings,
  Terminal,
  FileCode2,
  Ruler,
  Sun,
  MousePointer,
  Gauge,
} from 'lucide-react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getBackendUrl, Device, Component, SensorReading, DeviceCommand } from '@/lib/api';

export default function DeviceDetailPage() {
  const params = useParams();
  const deviceId = params.id as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic telemetry state map: { temperature: 28.4, humidity: 64, distance: 15.2, motion: true, ... }
  const [liveTelemetry, setLiveTelemetry] = useState<{ [key: string]: any }>({});

  // Dynamic output actuator states: { [gpio]: value }
  const [actuatorStates, setActuatorStates] = useState<{ [gpio: number]: number }>({});

  const [lastSeenTime, setLastSeenTime] = useState<string>('Just now');
  const [chartData, setChartData] = useState<any[]>([]);

  // 1. Fetch initial device data from backend
  const fetchDeviceData = async () => {
    try {
      const res = await axios.get(`${getBackendUrl()}/api/devices/${deviceId}`);
      setDevice(res.data.device);
      const comps: Component[] = res.data.components || [];
      setComponents(comps);
      setCommands(res.data.commands || []);

      const historicalReadings: SensorReading[] = res.data.readings || [];
      setReadings(historicalReadings);

      // Extract latest value for each telemetry key
      const latestMap: { [key: string]: any } = {};
      historicalReadings.forEach((r) => {
        if (latestMap[r.reading_type] === undefined) {
          latestMap[r.reading_type] = r.reading_type === 'motion' ? Number(r.value) === 1 : Number(r.value);
        }
      });
      setLiveTelemetry(latestMap);

      // Format chart history dynamically
      const pointsMap: { [time: string]: any } = {};
      historicalReadings.slice(0, 30).reverse().forEach((r) => {
        const t = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (!pointsMap[t]) pointsMap[t] = { time: t };
        pointsMap[t][r.reading_type] = Number(r.value);
      });
      setChartData(Object.values(pointsMap));
    } catch (err) {
      console.error('Failed to load device details:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Setup Socket.IO Real-Time Connection
  useEffect(() => {
    fetchDeviceData();

    const socketUrl = getBackendUrl();
    const socket: Socket = io(socketUrl);

    socket.on('connect', () => {
      console.log('Connected to real-time Socket.IO server');
      socket.emit('join_device', deviceId);
    });

    // Real-time telemetry event handler (merges ANY dynamic telemetry keys sent by ESP32)
    socket.on('device_telemetry', (data: any) => {
      if (data.deviceId === deviceId && data.readings) {
        const r = data.readings;

        setLiveTelemetry((prev) => ({
          ...prev,
          ...r,
        }));

        setLastSeenTime('Just now');
        setDevice((prev) => (prev ? { ...prev, status: 'ONLINE' } : prev));

        // Append to real-time chart dynamically
        const newTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setChartData((prev) => {
          const newPoint: any = { time: newTime, ...r };
          const updated = [...prev, newPoint];
          return updated.slice(-20);
        });
      }
    });

    // Real-time command ACK event handler
    socket.on('command_executed', (cmd: DeviceCommand) => {
      setCommands((prev) => [cmd, ...prev.slice(0, 15)]);
      setActuatorStates((prev) => ({
        ...prev,
        [cmd.gpio_pin]: cmd.value,
      }));
    });

    return () => {
      socket.emit('leave_device', deviceId);
      socket.disconnect();
    };
  }, [deviceId]);

  // Send output actuation command (e.g. LED ON/OFF, Servo angle)
  const sendActuationCommand = async (commandType: string, gpioPin: number, value: number) => {
    try {
      const res = await axios.post(`${getBackendUrl()}/api/devices/${deviceId}/commands`, {
        command_type: commandType,
        gpio_pin: gpioPin,
        value: value,
      });

      setActuatorStates((prev) => ({
        ...prev,
        [gpioPin]: value,
      }));

      setCommands((prev) => [res.data.command, ...prev.slice(0, 15)]);
    } catch (err) {
      alert('Failed to send actuation command.');
    }
  };

  // Helper to render dynamic telemetry gauge card for any key
  const renderTelemetryCard = (key: string, val: any) => {
    const lowerKey = key.toLowerCase();

    if (lowerKey === 'temperature') {
      return (
        <div key={key} className="glass-panel p-5 rounded-2xl border border-gray-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">Temperature</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Thermometer className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline space-x-1">
              <span className="text-3xl font-bold text-white">{val !== undefined ? Number(val).toFixed(1) : '--'}</span>
              <span className="text-sm font-semibold text-amber-400">°C</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">DHT11 Sensor</p>
          </div>
        </div>
      );
    }

    if (lowerKey === 'humidity') {
      return (
        <div key={key} className="glass-panel p-5 rounded-2xl border border-gray-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">Humidity</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Droplets className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline space-x-1">
              <span className="text-3xl font-bold text-white">{val !== undefined ? Number(val).toFixed(1) : '--'}</span>
              <span className="text-sm font-semibold text-blue-400">%</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">DHT11 Sensor</p>
          </div>
        </div>
      );
    }

    if (lowerKey === 'distance') {
      return (
        <div key={key} className="glass-panel p-5 rounded-2xl border border-gray-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">Ultrasonic Distance</span>
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
              <Ruler className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline space-x-1">
              <span className="text-3xl font-bold text-white">{val !== undefined ? Number(val).toFixed(1) : '--'}</span>
              <span className="text-sm font-semibold text-purple-400">cm</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">HC-SR04 Sensor</p>
          </div>
        </div>
      );
    }

    if (lowerKey === 'motion') {
      const isMotion = Boolean(val);
      return (
        <div key={key} className="glass-panel p-5 rounded-2xl border border-gray-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">PIR Motion</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            {isMotion ? (
              <span className="inline-flex items-center px-3 py-1 rounded-xl text-sm font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                🏃 DETECTED
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-xl text-sm font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                CLEAR
              </span>
            )}
            <p className="text-[11px] text-gray-500 mt-2">PIR Sensor</p>
          </div>
        </div>
      );
    }

    if (lowerKey === 'light') {
      return (
        <div key={key} className="glass-panel p-5 rounded-2xl border border-gray-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">Light Intensity</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Sun className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline space-x-1">
              <span className="text-3xl font-bold text-white">{val !== undefined ? val : '--'}</span>
              <span className="text-sm font-semibold text-amber-400">lux</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">LDR Sensor</p>
          </div>
        </div>
      );
    }

    if (lowerKey === 'button') {
      const isPressed = Number(val) === 1 || Boolean(val);
      return (
        <div key={key} className="glass-panel p-5 rounded-2xl border border-gray-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">Push Button</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <MousePointer className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            {isPressed ? (
              <span className="inline-flex items-center px-3 py-1 rounded-xl text-sm font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                🔘 PRESSED
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-xl text-sm font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                RELEASED
              </span>
            )}
            <p className="text-[11px] text-gray-500 mt-2">Digital Button</p>
          </div>
        </div>
      );
    }

    // Generic fallback telemetry card for any custom sensor key
    return (
      <div key={key} className="glass-panel p-5 rounded-2xl border border-gray-800 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase">{key}</span>
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <Gauge className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-baseline space-x-1">
            <span className="text-3xl font-bold text-white">{typeof val === 'boolean' ? (val ? 'TRUE' : 'FALSE') : val}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Telemetry Signal</p>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Loading live telemetry stream...</div>;
  }

  if (!device) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center">
        <Cpu className="h-12 w-12 text-red-400 mx-auto mb-2" />
        <h2 className="text-lg font-bold text-white">Device Not Found</h2>
        <p className="text-xs text-gray-400 mt-1 mb-4">No device registered with ID: {deviceId}</p>
        <Link href="/devices" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-medium">
          Back to Devices List
        </Link>
      </div>
    );
  }

  const getActiveSensorKeys = (comps: Component[]): Set<string> => {
    const activeKeys = new Set<string>();

    comps.forEach((comp) => {
      if (comp.category === 'OUTPUT') return;

      const typeUpper = (comp.type || '').toUpperCase();
      const nameLower = (comp.name || '').toLowerCase();

      if (typeUpper.includes('DHT') || typeUpper.includes('TEMP') || nameLower.includes('temp') || nameLower.includes('dht')) {
        activeKeys.add('temperature');
        activeKeys.add('humidity');
      }
      if (typeUpper.includes('PIR') || typeUpper.includes('MOTION') || nameLower.includes('motion')) {
        activeKeys.add('motion');
      }
      if (typeUpper.includes('HC-SR04') || typeUpper.includes('DISTANCE') || typeUpper.includes('ULTRASONIC') || nameLower.includes('distance')) {
        activeKeys.add('distance');
      }
      if (typeUpper.includes('LDR') || typeUpper.includes('LIGHT') || nameLower.includes('light')) {
        activeKeys.add('light');
      }
      if (typeUpper.includes('BUTTON') || nameLower.includes('button')) {
        activeKeys.add('button');
      }

      if (comp.type) activeKeys.add(comp.type.toLowerCase().replace(/\s+/g, '_'));
      if (comp.name) activeKeys.add(comp.name.toLowerCase().replace(/\s+/g, '_'));
    });

    return activeKeys;
  };

  const activeSensorKeys = getActiveSensorKeys(components);
  const activeTelemetryEntries = Object.entries(liveTelemetry).filter(([key]) =>
    activeSensorKeys.has(key.toLowerCase())
  );

  const outputComponents = components.filter((c) => c.category === 'OUTPUT' || c.type === 'LED' || c.type === 'BUZZER' || c.type === 'SERVO' || c.type === 'GENERIC_OUTPUT');

  return (
    <div className="space-y-8">
      {/* Device Title Header & Quick Navigation Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">{device.name}</h1>
            <span className="font-mono text-xs text-blue-300 px-2.5 py-1 bg-blue-950/60 border border-blue-800/60 rounded-lg">
              {device.id}
            </span>
            {device.status === 'ONLINE' ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-1.5"></span>
                ONLINE
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-800 text-gray-400">
                OFFLINE
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 flex items-center">
            <Clock className="h-3.5 w-3.5 mr-1 text-gray-500" />
            Last telemetry update: <span className="text-gray-300 ml-1">{lastSeenTime}</span>
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex items-center space-x-2 flex-wrap">
          <Link
            href={`/devices/${deviceId}/hardware`}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-medium border border-gray-700"
          >
            <Settings className="h-3.5 w-3.5 text-blue-400" />
            <span>Hardware Pins</span>
          </Link>

          <Link
            href={`/devices/${deviceId}/automations`}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-medium border border-gray-700"
          >
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span>Automations</span>
          </Link>

          <Link
            href={`/devices/${deviceId}/firmware`}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md"
          >
            <FileCode2 className="h-3.5 w-3.5" />
            <span>Firmware Generator</span>
          </Link>
        </div>
      </div>

      {/* DYNAMIC SENSOR TELEMETRY CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {components.filter((c) => c.category !== 'OUTPUT').length === 0 ? (
          <div className="col-span-full glass-panel p-6 rounded-2xl border border-gray-800 text-center text-xs text-gray-400">
            No input sensors configured on this device yet. Click{' '}
            <Link href={`/devices/${deviceId}/hardware`} className="text-blue-400 font-semibold underline">
              Hardware Pins
            </Link>{' '}
            to assign your sensors.
          </div>
        ) : activeTelemetryEntries.length === 0 ? (
          <div className="col-span-full glass-panel p-6 rounded-2xl border border-gray-800 text-center text-xs text-gray-400">
            Waiting for live telemetry stream from configured sensors...
          </div>
        ) : (
          activeTelemetryEntries.map(([key, val]) => renderTelemetryCard(key, val))
        )}
      </div>

      {/* Real-time Telemetry Line Chart */}
      <div className="glass-panel p-6 rounded-2xl border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white">Live Environmental History</h3>
            <p className="text-xs text-gray-400">WebSocket auto-streamed sensor readings</p>
          </div>
          <span className="text-xs font-mono text-emerald-400 flex items-center">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-1.5"></span> Live Feed
          </span>
        </div>

        <div className="h-64 w-full">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">
              Waiting for incoming sensor telemetry packets...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis dataKey="time" stroke="#6B7280" fontSize={11} />
                <YAxis stroke="#6B7280" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '12px', fontSize: '12px' }}
                />
                {activeSensorKeys.has('temperature') && (
                  <Line type="monotone" dataKey="temperature" name="Temperature (°C)" stroke="#F59E0B" strokeWidth={2.5} dot={false} />
                )}
                {activeSensorKeys.has('humidity') && (
                  <Line type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#3B82F6" strokeWidth={2.5} dot={false} />
                )}
                {activeSensorKeys.has('distance') && (
                  <Line type="monotone" dataKey="distance" name="Distance (cm)" stroke="#A855F7" strokeWidth={2.5} dot={false} />
                )}
                {activeSensorKeys.has('light') && (
                  <Line type="monotone" dataKey="light" name="Light (lux)" stroke="#EAB308" strokeWidth={2.5} dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* DYNAMIC MANUAL ACTUATOR CONTROLS & COMMAND STREAM GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dynamic Manual Controls */}
        <div className="glass-panel p-6 rounded-2xl border border-gray-800 space-y-5">
          <div>
            <h3 className="font-semibold text-white flex items-center">
              <Power className="h-4 w-4 mr-2 text-blue-400" /> Manual Hardware Control Panel
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Command physical output GPIO pins over Wi-Fi</p>
          </div>

          <div className="space-y-4">
            {outputComponents.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-gray-800 rounded-xl text-xs text-gray-400">
                No output actuators configured on this device yet. Click{' '}
                <Link href={`/devices/${deviceId}/hardware`} className="text-blue-400 font-semibold underline">
                  Hardware Pins
                </Link>{' '}
                to assign your LEDs, Buzzers, Relays, or Motors.
              </div>
            ) : (
              outputComponents.map((comp) => {
                const pinState = actuatorStates[comp.gpio_pin] ?? 0;
                return (
                  <div key={comp.id || comp.gpio_pin} className="p-4 bg-gray-900/80 rounded-xl border border-gray-800 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-white block">{comp.name}</span>
                      <span className="text-xs text-blue-300 font-mono">GPIO {comp.gpio_pin} ({comp.type})</span>
                    </div>
                    {comp.type === 'SERVO' ? (
                      <div className="w-48 space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-400">Angle:</span>
                          <span className="font-mono text-blue-400 font-bold">{pinState}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="180"
                          value={pinState}
                          onChange={(e) => setActuationStateLocally(comp.gpio_pin, Number(e.target.value))}
                          onMouseUp={(e) => sendActuationCommand('SERVO_ANGLE', comp.gpio_pin, Number((e.target as HTMLInputElement).value))}
                          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => sendActuationCommand('GPIO_WRITE', comp.gpio_pin, 1)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            pinState === 1 ? 'bg-emerald-600 text-white shadow-lg glow-green' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          ON
                        </button>
                        <button
                          onClick={() => sendActuationCommand('GPIO_WRITE', comp.gpio_pin, 0)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            pinState === 0 ? 'bg-red-600/30 text-red-300 border border-red-500/30' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          OFF
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Real-time Command Execution Log */}
        <div className="glass-panel p-6 rounded-2xl border border-gray-800 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-white flex items-center mb-1">
              <Terminal className="h-4 w-4 mr-2 text-emerald-400" /> Output Command Execution Stream
            </h3>
            <p className="text-xs text-gray-400 mb-4">Real-time status of commands polled and ACKed by ESP32</p>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {commands.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">No output commands dispatched yet.</p>
              ) : (
                commands.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="p-3 bg-gray-950/80 rounded-xl border border-gray-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono text-blue-300 font-semibold">#{cmd.id}</span>
                      <span className="text-gray-300 font-semibold ml-2">{cmd.command_type}</span>
                      <span className="text-gray-400 ml-1">GPIO {cmd.gpio_pin} → {cmd.value}</span>
                    </div>
                    <div>
                      {cmd.status === 'EXECUTED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          ACK EXECUTED
                        </span>
                      ) : cmd.status === 'SENT' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          SENT TO ESP32
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          PENDING POLL
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function setActuationStateLocally(gpioPin: number, val: number) {
    setActuatorStates((prev) => ({ ...prev, [gpioPin]: val }));
  }
}

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Cpu, Save, Plus, Trash2, ShieldAlert, CheckCircle2, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, Component } from '@/lib/api';

export default function HardwareConfigPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.id as string;

  const [components, setComponents] = useState<Partial<Component>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const availableTypes = [
    { type: 'DHT11', name: 'Temperature & Humidity Sensor', category: 'INPUT' },
    { type: 'PIR', name: 'PIR Motion Sensor', category: 'INPUT' },
    { type: 'LDR', name: 'Light Dependent Resistor (LDR)', category: 'INPUT' },
    { type: 'HC-SR04', name: 'Ultrasonic Distance Sensor', category: 'INPUT' },
    { type: 'PUSH_BUTTON', name: 'Digital Push Button', category: 'INPUT' },
    { type: 'GENERIC_DIGITAL', name: 'Generic Digital Sensor (Flame/Rain/Tilt/Touch)', category: 'INPUT' },
    { type: 'GENERIC_ANALOG', name: 'Generic Analog Sensor (Gas/Soil Moisture/Sound)', category: 'INPUT' },
    { type: 'LED', name: 'Status Indicator LED', category: 'OUTPUT' },
    { type: 'BUZZER', name: 'Audio Buzzer Alarm', category: 'OUTPUT' },
    { type: 'SERVO', name: 'Servo Motor Actuator', category: 'OUTPUT' },
    { type: 'GENERIC_OUTPUT', name: 'Generic Output Actuator (Relay/Solenoid/Motor)', category: 'OUTPUT' },
  ];

  const validGpios = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39];

  useEffect(() => {
    const fetchHardware = async () => {
      try {
        const res = await axios.get(`${getBackendUrl()}/api/devices/${deviceId}`);
        const comps: Component[] = res.data.components || [];

        if (comps.length > 0) {
          setComponents(comps);
        } else {
          // Pre-seed initial demo hardware defaults
          setComponents([
            { name: 'Temperature & Humidity', type: 'DHT11', gpio_pin: 4, category: 'INPUT' },
            { name: 'Motion Sensor', type: 'PIR', gpio_pin: 5, category: 'INPUT' },
            { name: 'Status LED', type: 'LED', gpio_pin: 18, category: 'OUTPUT' },
          ]);
        }
      } catch (err) {
        console.error('Failed to load hardware config:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHardware();
  }, [deviceId]);

  const handleAddComponent = () => {
    setErrorMsg(null);
    setComponents((prev) => [
      ...prev,
      {
        name: 'New Sensor/Actuator',
        type: 'LED',
        gpio_pin: 19,
        category: 'OUTPUT',
      },
    ]);
  };

  const handleRemoveComponent = (index: number) => {
    setErrorMsg(null);
    setComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateComponent = (index: number, field: string, value: any) => {
    setErrorMsg(null);
    setComponents((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };

      if (field === 'type') {
        const matched = availableTypes.find((t) => t.type === value);
        if (matched) {
          target.name = matched.name;
          target.category = matched.category as 'INPUT' | 'OUTPUT';
        }
      }

      updated[index] = target;
      return updated;
    });
  };

  const handleSaveConfig = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    // Front-end validation rules
    const usedPins = new Set<number>();
    for (const comp of components) {
      const pin = Number(comp.gpio_pin);

      if (isNaN(pin)) {
        setErrorMsg(`Please specify a valid GPIO pin number for ${comp.name}.`);
        return;
      }

      if (usedPins.has(pin)) {
        setErrorMsg(`Pin collision error! GPIO ${pin} is assigned to multiple components.`);
        return;
      }
      usedPins.add(pin);

      if (comp.gpio_secondary !== undefined && comp.gpio_secondary !== null && Number(comp.gpio_secondary) !== -1 && !isNaN(Number(comp.gpio_secondary))) {
        const secPin = Number(comp.gpio_secondary);
        if (usedPins.has(secPin)) {
          setErrorMsg(`Pin collision error! Secondary GPIO ${secPin} is assigned to multiple components.`);
          return;
        }
        usedPins.add(secPin);
      }
    }

    // Clean up component payload before submitting
    const cleanedComponents = components.map((c) => ({
      ...c,
      gpio_secondary: c.gpio_secondary && !isNaN(Number(c.gpio_secondary)) ? Number(c.gpio_secondary) : -1,
    }));

    setSaving(true);
    try {
      await axios.post(`${getBackendUrl()}/api/devices/${deviceId}/hardware`, {
        components: cleanedComponents,
      });

      setSuccessMsg('Hardware pin configuration saved successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to save hardware configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Loading hardware pin configurator...</div>;
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link href={`/devices/${deviceId}`} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Hardware Pin Configurator</h1>
            <p className="text-sm text-gray-400 mt-0.5">Device ID: <span className="text-blue-300 font-mono">{deviceId}</span></p>
          </div>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold shadow-lg glow-blue transition-all disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
        </button>
      </div>

      {/* Validation Messages */}
      {errorMsg && (
        <div className="p-4 bg-red-950/60 border border-red-800/80 rounded-2xl flex items-center space-x-3 text-red-300 text-sm">
          <ShieldAlert className="h-5 w-5 text-red-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800/80 rounded-2xl flex items-center space-x-3 text-emerald-300 text-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Hardware Component Assignment List */}
      <div className="glass-panel p-6 rounded-2xl border border-gray-800 space-y-6">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h3 className="font-bold text-white text-base">Connected Hardware Pins</h3>
            <p className="text-xs text-gray-400 mt-0.5">Assign sensors and actuators to physical ESP32 GPIO pins</p>
          </div>

          <button
            onClick={handleAddComponent}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-medium border border-gray-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Add Component</span>
          </button>
        </div>

        <div className="space-y-4">
          {components.map((comp, index) => (
            <div
              key={index}
              className="p-4 bg-gray-900/80 rounded-xl border border-gray-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full">
                {/* Component Select */}
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Component Type</label>
                  <select
                    value={comp.type}
                    onChange={(e) => handleUpdateComponent(index, 'type', e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    {availableTypes.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.type} ({t.category})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Name Input */}
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Label Name</label>
                  <input
                    type="text"
                    value={comp.name || ''}
                    onChange={(e) => handleUpdateComponent(index, 'name', e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* GPIO Pin Select */}
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">
                    {comp.type === 'HC-SR04' ? 'Trig Pin' : 'Primary GPIO Pin'}
                  </label>
                  <select
                    value={comp.gpio_pin}
                    onChange={(e) => handleUpdateComponent(index, 'gpio_pin', Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-blue-300 font-mono focus:outline-none focus:border-blue-500"
                  >
                    {validGpios.map((pin) => (
                      <option key={pin} value={pin}>
                        GPIO {pin}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional Secondary GPIO Pin Select for HC-SR04 */}
                {comp.type === 'HC-SR04' && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">Echo Pin</label>
                    <select
                      value={comp.gpio_secondary ?? 13}
                      onChange={(e) => handleUpdateComponent(index, 'gpio_secondary', Number(e.target.value))}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-purple-300 font-mono focus:outline-none focus:border-blue-500"
                    >
                      {validGpios.map((pin) => (
                        <option key={pin} value={pin}>
                          GPIO {pin}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleRemoveComponent(index)}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                title="Remove component"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

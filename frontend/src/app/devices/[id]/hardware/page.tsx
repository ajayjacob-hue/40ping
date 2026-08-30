'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Sliders, Save, Plus, Trash2, ShieldAlert, CheckCircle2, ArrowLeft, X, Edit2, AlertCircle } from 'lucide-react';
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

  // Multi-step Wizard Modal State
  const [showWizard, setShowWizard] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [step, setStep] = useState<number>(1);
  const [wizardName, setWizardName] = useState('');
  const [wizardType, setWizardType] = useState('DHT11');
  const [wizardCategory, setWizardCategory] = useState<'INPUT' | 'OUTPUT'>('INPUT');
  const [wizardGpio, setWizardGpio] = useState<number>(4);
  const [wizardGpioSec, setWizardGpioSec] = useState<number>(-1);

  const availableTypes = [
    { type: 'DHT11', name: 'DHT11 Temperature & Humidity Sensor', category: 'INPUT' },
    { type: 'PIR', name: 'PIR Motion Sensor', category: 'INPUT' },
    { type: 'LDR', name: 'Light Dependent Resistor (LDR)', category: 'INPUT' },
    { type: 'HC-SR04', name: 'Ultrasonic Distance Sensor', category: 'INPUT' },
    { type: 'PUSH_BUTTON', name: 'Digital Push Button', category: 'INPUT' },
    { type: 'GENERIC_DIGITAL', name: 'Generic Digital Input Sensor', category: 'INPUT' },
    { type: 'GENERIC_ANALOG', name: 'Generic Analog Input Sensor', category: 'INPUT' },
    { type: 'LED', name: 'Status Indicator LED', category: 'OUTPUT' },
    { type: 'BUZZER', name: 'Audio Buzzer Alarm', category: 'OUTPUT' },
    { type: 'RELAY', name: 'Power Relay Switch', category: 'OUTPUT' },
    { type: 'GENERIC_OUTPUT', name: 'Generic Digital Output Actuator', category: 'OUTPUT' },
  ];

  const validGpios = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39];

  useEffect(() => {
    const fetchHardware = async () => {
      try {
        const res = await axios.get(`${getBackendUrl()}/api/devices/${deviceId}`);
        setComponents(res.data.components || []);
      } catch (err) {
        console.error('Failed to load hardware config:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHardware();
  }, [deviceId]);

  // Compute assigned GPIO pins to highlight conflicts
  const pinConflictMap = useMemo(() => {
    const counts = new Map<number, number>();
    components.forEach((c) => {
      if (c.gpio_pin !== undefined) {
        counts.set(Number(c.gpio_pin), (counts.get(Number(c.gpio_pin)) || 0) + 1);
      }
      if (c.gpio_secondary !== undefined && c.gpio_secondary !== -1) {
        counts.set(Number(c.gpio_secondary), (counts.get(Number(c.gpio_secondary)) || 0) + 1);
      }
    });
    return counts;
  }, [components]);

  const hasAnyConflict = useMemo(() => {
    let conflict = false;
    pinConflictMap.forEach((count) => {
      if (count > 1) conflict = true;
    });
    return conflict;
  }, [pinConflictMap]);

  // Open Wizard for Add or Edit
  const openWizard = (index: number | null = null) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingIndex(index);
    setStep(1);

    if (index !== null && components[index]) {
      const comp = components[index];
      setWizardName(comp.name || '');
      setWizardType(comp.type || 'DHT11');
      setWizardCategory(comp.category as 'INPUT' | 'OUTPUT' || 'INPUT');
      setWizardGpio(comp.gpio_pin ?? 4);
      setWizardGpioSec(comp.gpio_secondary ?? -1);
    } else {
      setWizardName('DHT11 Temperature Sensor');
      setWizardType('DHT11');
      setWizardCategory('INPUT');
      // Auto pick unused GPIO
      const used = new Set<number>();
      pinConflictMap.forEach((_, pin) => used.add(pin));
      const firstFree = validGpios.find((p) => !used.has(p)) || 4;
      setWizardGpio(firstFree);
      setWizardGpioSec(-1);
    }

    setShowWizard(true);
  };

  const handleSaveWizardStep = () => {
    const updatedComp: Partial<Component> = {
      name: wizardName.trim() || wizardType,
      type: wizardType,
      gpio_pin: Number(wizardGpio),
      gpio_secondary: wizardType === 'HC-SR04' ? Number(wizardGpioSec) : -1,
      category: wizardCategory,
    };

    if (editingIndex !== null) {
      setComponents((prev) => {
        const next = [...prev];
        next[editingIndex] = updatedComp;
        return next;
      });
    } else {
      setComponents((prev) => [...prev, updatedComp]);
    }

    setShowWizard(false);
  };

  const handleRemoveComponent = (index: number) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveConfigToBackend = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (hasAnyConflict) {
      setErrorMsg('GPIO pin conflict detected! Multiple components are assigned to the same pin.');
      return;
    }

    try {
      setSaving(true);
      await axios.post(`${getBackendUrl()}/api/devices/${deviceId}/hardware`, {
        components,
      });

      setSuccessMsg('Hardware pin configuration applied and synced to ESP32!');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to update hardware pin configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Link href={`/devices/${deviceId}`} className="text-zinc-400 hover:text-zinc-100 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Hardware Configuration</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Configure the physical components and GPIO pin mappings connected to <strong className="text-zinc-200">{deviceId}</strong>.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openWizard(null)}>
            Add Component
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            icon={<Save className="h-3.5 w-3.5" />}
            onClick={handleSaveConfigToBackend}
          >
            Apply Configuration
          </Button>
        </div>
      </div>

      {/* Alert Banners */}
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-md flex items-center space-x-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-md flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {hasAnyConflict && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-md flex items-center space-x-2 font-mono">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Warning: Duplicate GPIO pin assignment detected! Please resolve conflicts before applying.</span>
        </div>
      )}

      {/* Component Mapping List */}
      <div className="dev-panel overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sliders className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-bold text-zinc-100">Configured Component Mappings</h2>
          </div>
          <span className="text-xs font-mono text-zinc-400">Total: {components.length} components</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-400">Loading pin configuration...</div>
        ) : components.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Sliders className="h-8 w-8 text-zinc-600 mx-auto" />
            <h3 className="text-sm font-semibold text-zinc-300">No Hardware Components Configured</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Add sensors or output actuators to map their physical ESP32 GPIO pins.
            </p>
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openWizard(null)}>
              Add First Component
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {components.map((comp, idx) => {
              const isConflict =
                (comp.gpio_pin !== undefined && (pinConflictMap.get(Number(comp.gpio_pin)) || 0) > 1) ||
                (comp.gpio_secondary !== undefined && comp.gpio_secondary !== -1 && (pinConflictMap.get(Number(comp.gpio_secondary)) || 0) > 1);

              return (
                <div
                  key={idx}
                  className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-zinc-800/40 transition-colors ${
                    isConflict ? 'bg-rose-500/5' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-xs text-zinc-100">{comp.name}</h3>
                      <Badge variant={comp.category === 'OUTPUT' ? 'info' : 'neutral'}>{comp.category}</Badge>
                      {isConflict && <Badge variant="error">GPIO Conflict</Badge>}
                    </div>
                    <p className="text-[11px] font-mono text-zinc-400">Driver Type: {comp.type}</p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1 font-mono text-xs">
                      <Badge variant="mono">GPIO {comp.gpio_pin}</Badge>
                      {comp.gpio_secondary !== undefined && comp.gpio_secondary !== -1 && (
                        <Badge variant="mono">Echo GPIO {comp.gpio_secondary}</Badge>
                      )}
                    </div>

                    <div className="flex items-center space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openWizard(idx)} title="Edit Component">
                        <Edit2 className="h-3.5 w-3.5 text-zinc-400 hover:text-zinc-100" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveComponent(idx)}
                        title="Delete Component"
                        className="text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Multi-step Component Configuration Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="dev-panel w-full max-w-md p-6 space-y-4 shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Sliders className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  {editingIndex !== null ? 'Edit Component Mapping' : 'Component Configuration Wizard'}
                </h3>
              </div>
              <button onClick={() => setShowWizard(false)} className="text-zinc-400 hover:text-zinc-100 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Step Navigation Indicator */}
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 border-b border-zinc-800/60 pb-2">
              <span className={step === 1 ? 'text-blue-400 font-bold' : ''}>1. Driver Type</span>
              <span>➔</span>
              <span className={step === 2 ? 'text-blue-400 font-bold' : ''}>2. GPIO Assignment</span>
              <span>➔</span>
              <span className={step === 3 ? 'text-blue-400 font-bold' : ''}>3. Review</span>
            </div>

            {/* STEP 1: Component Type */}
            {step === 1 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Select Driver Component</label>
                  <select
                    value={wizardType}
                    onChange={(e) => {
                      const type = e.target.value;
                      setWizardType(type);
                      const matched = availableTypes.find((t) => t.type === type);
                      if (matched) {
                        setWizardName(matched.name);
                        setWizardCategory(matched.category as any);
                      }
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded-md p-2.5 focus:border-blue-500 focus:outline-none font-mono"
                  >
                    {availableTypes.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.type} — {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Display Label</label>
                  <input
                    type="text"
                    value={wizardName}
                    onChange={(e) => setWizardName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded-md p-2 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
                  <Button variant="outline" size="sm" onClick={() => setShowWizard(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setStep(2)}>
                    Next: GPIO Assignment ➔
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 2: GPIO Assignment */}
            {step === 2 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Primary GPIO Pin</label>
                  <select
                    value={wizardGpio}
                    onChange={(e) => setWizardGpio(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded-md p-2.5 focus:border-blue-500 focus:outline-none font-mono"
                  >
                    {validGpios.map((pin) => {
                      const count = pinConflictMap.get(pin) || 0;
                      const isUsed = count > 0 && !(editingIndex !== null && components[editingIndex]?.gpio_pin === pin);
                      return (
                        <option key={pin} value={pin}>
                          GPIO {pin} {isUsed ? '(IN USE)' : '(Available)'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {wizardType === 'HC-SR04' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Echo Secondary GPIO Pin</label>
                    <select
                      value={wizardGpioSec}
                      onChange={(e) => setWizardGpioSec(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded-md p-2.5 focus:border-blue-500 focus:outline-none font-mono"
                    >
                      {validGpios.map((pin) => (
                        <option key={pin} value={pin}>
                          GPIO {pin}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                  <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                    ← Back
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setStep(3)}>
                    Next: Review ➔
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: Review & Apply */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-2 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Component:</span>
                    <span className="text-zinc-100 font-bold">{wizardName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Driver Type:</span>
                    <span className="text-blue-400">{wizardType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Category:</span>
                    <Badge variant={wizardCategory === 'OUTPUT' ? 'info' : 'neutral'}>{wizardCategory}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">GPIO Pin:</span>
                    <span className="text-emerald-400 font-bold">GPIO {wizardGpio}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                    ← Back
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleSaveWizardStep}>
                    Confirm & Add Component
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

'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { getBackendUrl, Device } from '@/lib/api';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import {
  Zap,
  Plus,
  Trash2,
  Sparkles,
  Check,
  ToggleLeft,
  ToggleRight,
  Sliders,
  Cpu,
  X,
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface AutomationRule {
  id: number;
  device_id: string;
  device_name?: string;
  name: string;
  sensor_component: string;
  condition: string;
  trigger_value: number;
  action_component: string;
  action_type: string;
  action_value: number;
  is_active: boolean;
  created_at: string;
}

interface ProposedConfig {
  ruleName: string;
  sensorComponent: string;
  condition: string;
  triggerValue: number;
  actionComponent: string;
  actionValue: number;
  hardwareSummary: string[];
}

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

  // Modal Visual Builder State
  const [showModal, setShowModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [ruleName, setRuleName] = useState('');
  const [sensorComp, setSensorComp] = useState('DHT11');
  const [condition, setCondition] = useState('GREATER_THAN');
  const [triggerValue, setTriggerValue] = useState<number>(30);
  const [actionComp, setActionComp] = useState('LED');
  const [actionValue, setActionValue] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  // Copilot AI Assistant State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [proposedConfig, setProposedConfig] = useState<ProposedConfig | null>(null);
  const [aiMessage, setAiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [triggerAlert, setTriggerAlert] = useState<string | null>(null);

  const backendUrl = getBackendUrl();

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true);
      const [rulesRes, devRes] = await Promise.all([
        axios.get(`${backendUrl}/api/automations`),
        axios.get(`${backendUrl}/api/devices`),
      ]);

      setRules(rulesRes.data.rules || []);
      const devList = devRes.data.devices || [];
      setDevices(devList);
      if (devList.length > 0 && !selectedDevice) {
        setSelectedDevice(devList[0].id);
      }
    } catch (err) {
      console.error('Failed to load automations data:', err);
    } finally {
      setInitialLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);

    const socket: Socket = io(backendUrl);

    socket.on('automation_triggered', (data: { message: string }) => {
      setTriggerAlert(data.message);
      setTimeout(() => setTriggerAlert(null), 5000);
    });

    socket.on('rule_created', () => fetchData(false));
    socket.on('rule_deleted', () => fetchData(false));
    socket.on('rule_updated', () => fetchData(false));

    return () => {
      socket.disconnect();
    };
  }, [backendUrl]);

  // Toggle Active State
  const handleToggle = async (ruleId: number, currentStatus: boolean) => {
    try {
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, is_active: !currentStatus } : r))
      );
      await axios.patch(`${backendUrl}/api/automations/${ruleId}/toggle`, {
        is_active: !currentStatus,
      });
    } catch (err) {
      console.error('Failed to toggle rule:', err);
      fetchData(false);
    }
  };

  // Delete Rule
  const handleDelete = async (ruleId: number) => {
    try {
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      await axios.delete(`${backendUrl}/api/automations/${ruleId}`);
    } catch (err) {
      console.error('Failed to delete rule:', err);
      fetchData(false);
    }
  };

  // Create Visual Rule
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;

    try {
      setSubmitting(true);
      await axios.post(`${backendUrl}/api/devices/${selectedDevice}/automations`, {
        name: ruleName || `IF ${sensorComp} ${condition} ${triggerValue} ➔ SET ${actionComp} = ${actionValue}`,
        sensor_component: sensorComp,
        condition,
        trigger_value: triggerValue,
        action_component: actionComp,
        action_type: 'GPIO_WRITE',
        action_value: actionValue,
      });

      setShowModal(false);
      setRuleName('');
      fetchData(false);
    } catch (err) {
      console.error('Failed to create rule:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1: AI Copilot - Generate Proposed Configuration Review
  const handleAiGenerateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    try {
      setAiLoading(true);
      setAiMessage(null);
      setProposedConfig(null);

      const devId = selectedDevice || (devices[0]?.id || '');
      if (!devId) {
        setAiMessage({ type: 'error', text: 'Please register an ESP32 hardware device first.' });
        return;
      }

      const res = await axios.post(`${backendUrl}/api/copilot/parse`, {
        prompt: aiPrompt,
        deviceId: devId,
      });

      const parsed = res.data;
      if (parsed.success && parsed.rule) {
        setProposedConfig({
          ruleName: parsed.rule.name,
          sensorComponent: parsed.rule.sensor_component,
          condition: parsed.rule.condition,
          triggerValue: parsed.rule.trigger_value,
          actionComponent: parsed.rule.action_component,
          actionValue: parsed.rule.action_value,
          hardwareSummary: [
            `Sensor Node: ${parsed.rule.sensor_component} (${parsed.rule.condition} ${parsed.rule.trigger_value})`,
            `Actuator Target: ${parsed.rule.action_component} ➔ Set to ${parsed.rule.action_value === 1 ? 'HIGH' : 'LOW'}`,
          ],
        });
      } else {
        setAiMessage({ type: 'error', text: parsed.error || 'Could not infer rule logic from input prompt.' });
      }
    } catch (err) {
      setAiMessage({ type: 'error', text: 'AI Copilot processing failed.' });
    } finally {
      setAiLoading(false);
    }
  };

  // Step 2: Apply Proposed Configuration after user review
  const handleApplyProposedConfig = async () => {
    if (!proposedConfig) return;
    const devId = selectedDevice || (devices[0]?.id || '');
    if (!devId) return;

    try {
      setAiLoading(true);
      await axios.post(`${backendUrl}/api/devices/${devId}/automations`, {
        name: proposedConfig.ruleName,
        sensor_component: proposedConfig.sensorComponent,
        condition: proposedConfig.condition,
        trigger_value: proposedConfig.triggerValue,
        action_component: proposedConfig.actionComponent,
        action_type: 'GPIO_WRITE',
        action_value: proposedConfig.actionValue,
      });

      setAiMessage({ type: 'success', text: `Applied configuration: "${proposedConfig.ruleName}"` });
      setProposedConfig(null);
      setAiPrompt('');
      fetchData(false);
    } catch (err) {
      setAiMessage({ type: 'error', text: 'Failed to apply proposed rule.' });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time Trigger Notification Toast */}
      {triggerAlert && (
        <div className="fixed bottom-5 right-5 z-50 p-4 bg-zinc-900 border border-blue-500 text-zinc-100 rounded-lg shadow-2xl flex items-center space-x-3 text-xs animate-bounce">
          <Zap className="h-4 w-4 text-blue-400 shrink-0" />
          <div>
            <span className="font-bold block text-blue-300">Automation Triggered</span>
            <span>{triggerAlert}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Automation Studio</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure sub-10ms edge IFTTT rules and natural language automation logic.
          </p>
        </div>

        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowModal(true)}>
          Create Visual Rule
        </Button>
      </div>

      {/* AI Copilot Developer Assistant Box */}
      <div className="dev-panel p-5 space-y-4 bg-gradient-to-r from-zinc-900 via-[#121215] to-zinc-900 border-zinc-700/60">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-blue-600/20 border border-blue-500/30 rounded text-blue-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-zinc-100">AI IoT Copilot</h2>
            <p className="text-[11px] text-zinc-400">Describe what you want to build in plain English.</p>
          </div>
        </div>

        <form onSubmit={handleAiGenerateProposal} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g., Turn on LED when motion is detected, or Turn on buzzer if temperature exceeds 30°C..."
              className="flex-1 bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none font-sans"
            />
            <Button variant="secondary" size="sm" type="submit" loading={aiLoading} icon={<Sparkles className="h-3.5 w-3.5 text-blue-400" />}>
              Generate Proposal
            </Button>
          </div>
        </form>

        {aiMessage && (
          <div
            className={`p-3 rounded text-xs flex items-center space-x-2 ${
              aiMessage.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {aiMessage.type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{aiMessage.text}</span>
          </div>
        )}

        {/* Proposed Configuration Review Panel (Requires Explicit User Confirmation) */}
        {proposedConfig && (
          <div className="dev-panel p-4 bg-zinc-950 border-blue-500/40 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold text-blue-300 font-mono">Proposed Configuration Review</span>
              <Badge variant="info">Confirmation Required</Badge>
            </div>

            <div className="space-y-2 font-mono text-xs text-zinc-300">
              <p className="font-semibold text-zinc-100">Rule Name: {proposedConfig.ruleName}</p>
              <div className="p-2 bg-zinc-900 border border-zinc-800 rounded space-y-1">
                {proposedConfig.hardwareSummary.map((item, idx) => (
                  <p key={idx} className="text-zinc-400">
                    ✓ {item}
                  </p>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setProposedConfig(null)}>
                Discard
              </Button>
              <Button variant="primary" size="sm" icon={<Check className="h-3.5 w-3.5" />} onClick={handleApplyProposedConfig}>
                Apply Configuration
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Active Rules List */}
      <div className="dev-panel overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-bold text-zinc-100">Configured Automation Rules</h2>
          </div>
          <span className="text-xs font-mono text-zinc-400">Total: {rules.length} rules</span>
        </div>

        {initialLoading ? (
          <div className="p-8 text-center text-xs text-zinc-400">Loading automation rules...</div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No Automation Rules Configured"
            description="Create visual WHEN ... THEN ... logic rules or use the AI Copilot above."
            actionLabel="Create Visual Rule"
            onAction={() => setShowModal(true)}
          />
        ) : (
          <div className="divide-y divide-zinc-800">
            {rules.map((rule) => (
              <div key={rule.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-zinc-800/40 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-xs text-zinc-100">{rule.name}</h3>
                    <Badge variant={rule.is_active ? 'success' : 'neutral'}>
                      {rule.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>

                  {/* Horizontal Rule Structure */}
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-300">
                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[11px]">
                      WHEN
                    </span>
                    <span className="text-zinc-200 font-semibold">{rule.sensor_component}</span>
                    <span className="text-blue-400">{rule.condition}</span>
                    <span className="text-emerald-400 font-bold">{rule.trigger_value}</span>
                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[11px]">
                      THEN
                    </span>
                    <span className="text-zinc-200 font-semibold">{rule.action_component}</span>
                    <span className="text-amber-400">{rule.action_value === 1 ? 'TURN ON (1)' : 'TURN OFF (0)'}</span>
                  </div>

                  <p className="text-[11px] text-zinc-500 font-mono">Device: {rule.device_id}</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleToggle(rule.id, rule.is_active)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-100 transition-colors"
                    title={rule.is_active ? 'Disable Rule' : 'Enable Rule'}
                  >
                    {rule.is_active ? (
                      <ToggleRight className="h-6 w-6 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-zinc-600" />
                    )}
                  </button>

                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                    title="Delete Rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Visual Rule Builder Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="dev-panel w-full max-w-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Zap className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold text-zinc-100">Visual Automation Rule Builder</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-zinc-400 hover:text-zinc-100 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Target Hardware Device</label>
                <select
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded-md p-2.5 font-mono"
                  required
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Motion activated lighting"
                  className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded-md p-2"
                />
              </div>

              {/* Visual WHEN Block */}
              <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold">WHEN (TRIGGER CONDITION)</span>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={sensorComp}
                    onChange={(e) => setSensorComp(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                  >
                    <option value="DHT11">DHT11</option>
                    <option value="PIR">PIR Motion</option>
                    <option value="LDR">LDR Light</option>
                    <option value="HC-SR04">Distance</option>
                    <option value="PUSH_BUTTON">Push Button</option>
                  </select>

                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                  >
                    <option value="GREATER_THAN">GREATER THAN</option>
                    <option value="LESS_THAN">LESS THAN</option>
                    <option value="EQUALS">EQUALS</option>
                    <option value="DETECTED">DETECTED</option>
                  </select>

                  <input
                    type="number"
                    value={triggerValue}
                    onChange={(e) => setTriggerValue(Number(e.target.value))}
                    className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                    required
                  />
                </div>
              </div>

              {/* Visual THEN Block */}
              <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold">THEN (ACTION OUTPUT)</span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={actionComp}
                    onChange={(e) => setActionComp(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                  >
                    <option value="LED">LED</option>
                    <option value="BUZZER">Buzzer</option>
                    <option value="RELAY">Relay</option>
                    <option value="GENERIC_OUTPUT">Output Actuator</option>
                  </select>

                  <select
                    value={actionValue}
                    onChange={(e) => setActionValue(Number(e.target.value))}
                    className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                  >
                    <option value={1}>TURN ON (1)</option>
                    <option value={0}>TURN OFF (0)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
                <Button variant="outline" size="sm" type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" loading={submitting}>
                  Save Automation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

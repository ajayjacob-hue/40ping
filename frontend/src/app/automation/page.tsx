'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { getBackendUrl, Device } from '@/lib/api';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Link from 'next/link';
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
  AlertCircle,
  Code2,
  Copy,
  Terminal,
  Bot,
  Flame,
  ArrowUpRight,
  Download
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
  explanation: string;
  cppConditionCode: string;
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

  // Copilot AI Assistant State (Powered by Reka AI)
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [autoApplying, setAutoApplying] = useState(false);
  const [proposedConfig, setProposedConfig] = useState<ProposedConfig | null>(null);
  const [aiMessage, setAiMessage] = useState<{ type: 'success' | 'error'; text: string; details?: string } | null>(null);
  const [triggerAlert, setTriggerAlert] = useState<string | null>(null);

  // Main Code Live Synchronized Preview State
  const [mainCode, setMainCode] = useState<string>('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [showCodePanel, setShowCodePanel] = useState(true);

  const backendUrl = getBackendUrl();

  const QUICK_PROMPTS = [
    { label: '🔥 LED if Temp > 32°C', prompt: 'Turn on LED if temperature exceeds 32 degrees' },
    { label: '🚨 Buzzer on Motion', prompt: 'Sound the buzzer alarm when motion is detected' },
    { label: '🚪 Servo 90° on Proximity', prompt: 'Rotate servo to 90 degrees if distance is less than 20cm' },
    { label: '💡 Relay when Dark', prompt: 'If light level drops below 300 turn on relay' },
    { label: '🔘 Button pressed ➔ LED Off', prompt: 'Turn off LED when button is pressed' }
  ];

  const buildMainLoopCode = (activeRules: AutomationRule[]) => {
    const filtered = activeRules.filter((r) => r.is_active !== false);
    let conditionsCode = '';
    if (filtered.length === 0) {
      conditionsCode = `  // No active smart automations configured yet.\n  // Use the Reka AI Copilot above to automatically inject real-time edge conditions.`;
    } else {
      conditionsCode = filtered
        .map((r, i) => {
          let op = r.condition === 'GREATER_THAN' ? '>' : r.condition === 'LESS_THAN' ? '<' : '==';
          let check = '';
          if (r.sensor_component === 'DHT11') check = `temp ${op} ${r.trigger_value}.0`;
          else if (r.sensor_component === 'PIR') check = `digitalRead(PIR_PIN) == HIGH`;
          else if (r.sensor_component === 'LDR') check = `analogRead(LDR_PIN) ${op} ${r.trigger_value}`;
          else if (r.sensor_component === 'HC-SR04') check = `distanceCm ${op} ${r.trigger_value}.0`;
          else if (r.sensor_component === 'PUSH_BUTTON') check = `digitalRead(BUTTON_PIN) == LOW`;
          else check = `sensorVal > ${r.trigger_value}`;

          const isMomentary = r.sensor_component === 'PIR' || r.sensor_component === 'PUSH_BUTTON';
          const dur = (r as any).duration_seconds || (isMomentary ? 5 : 0);
          const pinName = `${r.action_component}_PIN`;
          const timerVar = `timer_${r.action_component.toLowerCase()}`;

          if (r.action_component === 'SERVO') {
            return `  // Smart Automation Rule ${i + 1}: ${r.name}\n  if (${check}) {\n    servoMotor.write(${r.action_value});\n  }`;
          } else if (dur > 0) {
            return `  // Smart Automation Rule ${i + 1}: ${r.name} (${dur}s Timed Pulse)\n  if (${check}) {\n    ${timerVar} = millis() + ${dur * 1000}; // Keep ON for ${dur}s\n    digitalWrite(${pinName}, HIGH);\n  } else if (millis() > ${timerVar}) {\n    digitalWrite(${pinName}, LOW);  // Auto-off after ${dur}s\n  }`;
          } else {
            const onState = Number(r.action_value) === 1 ? 'HIGH' : 'LOW';
            const offState = Number(r.action_value) === 1 ? 'LOW' : 'HIGH';
            return `  // Smart Automation Rule ${i + 1}: ${r.name} (Auto-reset)\n  if (${check}) {\n    digitalWrite(${pinName}, ${onState});\n  } else {\n    digitalWrite(${pinName}, ${offState});\n  }`;
          }
        })
        .join('\n\n');
    }

    return `// =======================================================
// ⚡ ESP32 LOCAL EDGE SMART AUTOMATION EVALUATION
// Auto-updated via Reka AI Copilot & Web Automation Studio
// =======================================================
unsigned long timer_led    = 0;
unsigned long timer_buzzer = 0;
unsigned long timer_relay  = 0;

void evaluateLocalAutomations() {
${conditionsCode}
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqttClient.connected()) connectMQTT();
  else mqttClient.loop();

  // 1. Evaluate Active Smart Edge Conditions Instantly (< 1ms latency)
  evaluateLocalAutomations();

  unsigned long currentMillis = millis();

  // 2. Transmit Telemetry Every 2000ms
  if (currentMillis - lastTelemetryTime >= 2000) {
    lastTelemetryTime = currentMillis;
    sendTelemetry();
  }

  delay(10);
}`;
  };

  const fetchMainLoopCode = async (devId: string) => {
    if (!devId) return;
    try {
      const res = await axios.get(`${backendUrl}/api/devices/${devId}/firmware/main-loop`);
      if (res.data?.mainLoopCode) {
        setMainCode(res.data.mainLoopCode);
      }
    } catch (err) {
      console.error('Failed to load main loop code:', err);
    }
  };

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true);
      const [rulesRes, devRes] = await Promise.all([
        axios.get(`${backendUrl}/api/automations`).catch(() => ({ data: { rules: [] } })),
        axios.get(`${backendUrl}/api/devices`).catch(() => ({ data: { devices: [] } })),
      ]);

      const fetchedRules = rulesRes.data.rules || [];
      setRules(fetchedRules);
      setMainCode(buildMainLoopCode(fetchedRules));

      const devList = devRes.data.devices || [];
      setDevices(devList);

      const activeDevId = selectedDevice || (devList.length > 0 ? devList[0].id : '');
      if (devList.length > 0 && !selectedDevice) {
        setSelectedDevice(devList[0].id);
      }

      if (activeDevId) {
        fetchMainLoopCode(activeDevId);
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

    socket.on('rule_created', () => {
      fetchData(false);
    });
    socket.on('rule_deleted', () => {
      fetchData(false);
    });
    socket.on('rule_updated', () => {
      fetchData(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [backendUrl]);

  useEffect(() => {
    if (selectedDevice) {
      fetchMainLoopCode(selectedDevice);
    }
  }, [selectedDevice]);

  // Toggle Active State
  const handleToggle = async (ruleId: number, currentStatus: boolean) => {
    try {
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, is_active: !currentStatus } : r))
      );
      await axios.patch(`${backendUrl}/api/automations/${ruleId}/toggle`, {
        is_active: !currentStatus,
      });
      if (selectedDevice) fetchMainLoopCode(selectedDevice);
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
      if (selectedDevice) fetchMainLoopCode(selectedDevice);
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

  // Reka AI: 1-Click "Understand & Auto-Update Main Code"
  const handleAiAutoApply = async (customPrompt?: string) => {
    const promptToUse = customPrompt || aiPrompt;
    if (!promptToUse.trim()) return;

    try {
      setAutoApplying(true);
      setAiMessage(null);
      setProposedConfig(null);

      const devId = selectedDevice || (devices[0]?.id || 'ESP32-AUTO');

      const res = await axios.post(`${backendUrl}/api/copilot/parse`, {
        prompt: promptToUse,
        deviceId: devId,
        autoApply: true,
      });

      const parsed = res.data;
      if (parsed.success && parsed.rule) {
        setAiMessage({
          type: 'success',
          text: `✨ Reka AI understood prompt & automatically updated main code!`,
          details: `Rule: "${parsed.rule.name}" ➔ Condition injected into ESP32 evaluateLocalAutomations() loop.`,
        });

        if (parsed.updated_main_code) {
          setMainCode(parsed.updated_main_code);
        }

        setAiPrompt('');
        fetchData(false);
      } else {
        setAiMessage({ type: 'error', text: parsed.error || 'Could not understand rule condition from input prompt.' });
      }
    } catch (err: any) {
      setAiMessage({ type: 'error', text: 'AI processing failed.', details: err.message });
    } finally {
      setAutoApplying(false);
    }
  };

  // Reka AI: Review Proposed Configuration before applying
  const handleAiGenerateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    try {
      setAiLoading(true);
      setAiMessage(null);
      setProposedConfig(null);

      const devId = selectedDevice || (devices[0]?.id || 'ESP32-AUTO');

      const res = await axios.post(`${backendUrl}/api/copilot/parse`, {
        prompt: aiPrompt,
        deviceId: devId,
        autoApply: false,
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
          explanation: parsed.explanation,
          cppConditionCode: parsed.cpp_condition_code,
          hardwareSummary: [
            `Sensor Input: ${parsed.rule.sensor_component} (${parsed.rule.condition} ${parsed.rule.trigger_value})`,
            `Actuator Output: ${parsed.rule.action_component} ➔ Set to ${parsed.rule.action_value === 1 ? 'HIGH / 1' : 'LOW / 0'}`,
            `AI Model: ${parsed.provider} (${parsed.modelUsed || 'reka-edge-2603'})`,
          ],
        });
      } else {
        setAiMessage({ type: 'error', text: parsed.error || 'Could not infer rule logic from input prompt.' });
      }
    } catch (err: any) {
      setAiMessage({ type: 'error', text: 'Reka AI Copilot processing failed.', details: err.message });
    } finally {
      setAiLoading(false);
    }
  };

  // Apply Proposed Configuration after user review
  const handleApplyProposedConfig = async () => {
    if (!proposedConfig) return;
    const devId = selectedDevice || (devices[0]?.id || 'ESP32-AUTO');

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

      setAiMessage({
        type: 'success',
        text: `Applied condition & updated main code: "${proposedConfig.ruleName}"`,
      });
      setProposedConfig(null);
      setAiPrompt('');
      fetchData(false);
    } catch (err) {
      setAiMessage({ type: 'error', text: 'Failed to apply proposed rule.' });
    } finally {
      setAiLoading(false);
    }
  };

  const copyCode = () => {
    if (!mainCode) return;
    navigator.clipboard.writeText(mainCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
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
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Automation Studio</h1>
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/40 text-blue-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" /> Reka AI Powered
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Describe conditions in plain English — Reka AI understands intent and automatically updates the ESP32 main firmware code and edge rules.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {devices.length > 0 && (
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded px-2.5 py-1.5 font-mono focus:border-blue-500 focus:outline-none"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  Device: {d.name} ({d.id})
                </option>
              ))}
            </select>
          )}

          <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowModal(true)}>
            Visual Builder
          </Button>
        </div>
      </div>

      {/* AI Copilot Developer Assistant Box (Powered by Reka AI) */}
      <div className="dev-panel p-5 space-y-4 bg-gradient-to-br from-zinc-900 via-[#101018] to-zinc-950 border-zinc-700/60 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-lg shadow-sm">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xs font-bold text-zinc-100">Smart AI Automation Copilot</h2>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-900/40 border border-purple-500/30 text-purple-300">
                  reka-edge-2603
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Type any condition in natural language. Reka AI translates it and updates the main ESP32 code instantly.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-zinc-400 font-mono">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
              API Connected
            </span>
          </div>
        </div>

        {/* Quick Prompt Chips */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Quick Presets:</span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((qp, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setAiPrompt(qp.prompt);
                  handleAiAutoApply(qp.prompt);
                }}
                className="px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-[11px] text-zinc-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer"
              >
                <span>{qp.label}</span>
                <ArrowRight className="w-2.5 h-2.5 opacity-60" />
              </button>
            ))}
          </div>
        </div>

        {/* Main Prompt Input Form */}
        <form onSubmit={handleAiGenerateProposal} className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g., Turn on LED when temperature exceeds 32°C, or sound buzzer alarm if motion is detected..."
                className="w-full bg-zinc-950/90 border border-zinc-700/80 text-xs text-zinc-100 rounded-lg px-3.5 py-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 focus:outline-none font-sans placeholder:text-zinc-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                type="button"
                loading={autoApplying}
                onClick={() => handleAiAutoApply()}
                icon={<Zap className="h-3.5 w-3.5 text-amber-300" />}
                className="whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
              >
                Understand & Auto-Update Code
              </Button>

              <Button
                variant="secondary"
                size="sm"
                type="submit"
                loading={aiLoading}
                icon={<Sparkles className="h-3.5 w-3.5 text-purple-400" />}
                className="whitespace-nowrap"
              >
                Review Proposal
              </Button>
            </div>
          </div>
        </form>

        {/* Feedback Message Alert */}
        {aiMessage && (
          <div
            className={`p-3 rounded-lg text-xs flex flex-col space-y-1 ${
              aiMessage.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
            }`}
          >
            <div className="flex items-center space-x-2">
              {aiMessage.type === 'success' ? <Check className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />}
              <span className="font-semibold">{aiMessage.text}</span>
            </div>
            {aiMessage.details && <p className="text-[11px] opacity-80 pl-6 font-mono">{aiMessage.details}</p>}
          </div>
        )}

        {/* Proposed Configuration Review Panel */}
        {proposedConfig && (
          <div className="dev-panel p-4 bg-zinc-950 border border-purple-500/40 space-y-3 rounded-lg shadow-inner">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-bold text-purple-300 font-mono">Reka AI Proposal Review</span>
              </div>
              <Badge variant="info">Confirmation Required</Badge>
            </div>

            <div className="space-y-2.5 font-mono text-xs text-zinc-300">
              <p className="font-semibold text-zinc-100">
                Rule Name: <span className="text-blue-300">{proposedConfig.ruleName}</span>
              </p>

              {proposedConfig.explanation && (
                <p className="text-[11px] text-zinc-400 font-sans italic bg-zinc-900/60 p-2 rounded border border-zinc-800">
                  &ldquo;{proposedConfig.explanation}&rdquo;
                </p>
              )}

              {/* Hardware Summary */}
              <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded space-y-1 text-[11px]">
                {proposedConfig.hardwareSummary.map((item, idx) => (
                  <p key={idx} className="text-zinc-400">
                    ✓ {item}
                  </p>
                ))}
              </div>

              {/* Generated C++ Condition Snippet */}
              {proposedConfig.cppConditionCode && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                    Generated C++ Condition Code for ESP32:
                  </span>
                  <pre className="p-2.5 bg-zinc-900/90 border border-zinc-800 rounded text-emerald-400 text-[11px] overflow-x-auto">
                    {proposedConfig.cppConditionCode}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
              <Button variant="outline" size="sm" onClick={() => setProposedConfig(null)}>
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Check className="h-3.5 w-3.5" />}
                onClick={handleApplyProposedConfig}
              >
                Apply & Update Main Code
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Live ESP32 Main Firmware Code Panel (Automatically Updated) */}
      <div className="dev-panel overflow-hidden border border-zinc-800 bg-[#0d0d12]">
        <div className="p-3.5 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Code2 className="h-4 w-4 text-emerald-400" />
            <div>
              <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                Live ESP32 Main Firmware Code
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Auto-Synchronized
                </span>
              </h2>
              <p className="text-[10px] text-zinc-400">
                Active automation conditions are automatically compiled into the ESP32 edge execution loop below.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={copyCode}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-mono rounded border border-zinc-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {codeCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{codeCopied ? 'Copied!' : 'Copy C++'}</span>
            </button>

            {selectedDevice && (
              <Link
                href={`/devices/${selectedDevice}/firmware`}
                className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-[11px] font-mono rounded border border-blue-500/30 flex items-center gap-1 transition-colors"
              >
                <span>Full .ino Firmware</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>

        <div className="p-4 bg-zinc-950 overflow-x-auto max-h-72 font-mono text-[11.5px] leading-relaxed text-zinc-300">
          <pre className="text-emerald-400 whitespace-pre">
            {mainCode || '// Loading live main firmware code...'}
          </pre>
        </div>
      </div>

      {/* Active Rules List */}
      <div className="dev-panel overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-bold text-zinc-100">Configured Automation Rules</h2>
          </div>
          <span className="text-xs font-mono text-zinc-400">Total: {rules.length} rules active</span>
        </div>

        {initialLoading ? (
          <div className="p-8 text-center text-xs text-zinc-400">Loading automation rules...</div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No Automation Rules Configured"
            description="Use the Reka AI Copilot above or click Visual Builder to create your first smart automation."
            actionLabel="Create Visual Rule"
            onAction={() => setShowModal(true)}
          />
        ) : (
          <div className="divide-y divide-zinc-800">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-zinc-800/40 transition-colors"
              >
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
                    className="p-1.5 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
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
                    className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
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
                    <option value="SERVO">Servo Motor</option>
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

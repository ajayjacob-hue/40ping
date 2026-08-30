'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Zap, Plus, Trash2, ArrowLeft, Check, Sparkles } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, AutomationRule, Component } from '@/lib/api';

export default function DeviceAutomationsPage() {
  const params = useParams();
  const deviceId = params.id as string;

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [ruleName, setRuleName] = useState('');
  const [sensorComp, setSensorComp] = useState('PIR');
  const [condition, setCondition] = useState<'DETECTED' | 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN'>('DETECTED');
  const [triggerVal, setTriggerVal] = useState<number>(1);
  const [actionComp, setActionComp] = useState('LED');
  const [actionVal, setActionVal] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  const fetchRulesAndComponents = async () => {
    try {
      const res = await axios.get(`${getBackendUrl()}/api/devices/${deviceId}`);
      setRules(res.data.rules || []);
      setComponents(res.data.components || []);
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRulesAndComponents();
  }, [deviceId]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await axios.post(`${getBackendUrl()}/api/devices/${deviceId}/automations`, {
        name: ruleName || `IF ${sensorComp} ${condition} THEN ${actionComp} = ${actionVal}`,
        sensor_component: sensorComp,
        condition,
        trigger_value: triggerVal,
        action_component: actionComp,
        action_type: 'GPIO_WRITE',
        action_value: actionVal,
      });

      setRuleName('');
      fetchRulesAndComponents();
    } catch (err) {
      console.error('Failed to create rule:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      await axios.delete(`${getBackendUrl()}/api/automations/${ruleId}`);
      fetchRulesAndComponents();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Link href={`/devices/${deviceId}`} className="text-zinc-400 hover:text-zinc-100 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Automation Rules — {deviceId}</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Configure sub-10ms edge IFTTT rules for physical GPIO pins on node <strong className="text-zinc-200">{deviceId}</strong>.
          </p>
        </div>
      </div>

      {/* Visual Rule Builder Card */}
      <div className="dev-panel p-5 space-y-4">
        <div className="flex items-center space-x-2 border-b border-zinc-800 pb-3">
          <Zap className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-bold text-zinc-100">Create New Visual Rule</h2>
        </div>

        <form onSubmit={handleCreateRule} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">Rule Name</label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="e.g. Turn ON LED when PIR detects motion"
              className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-2">
              <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase">WHEN (TRIGGER CONDITION)</span>
              <div className="space-y-2">
                <select
                  value={sensorComp}
                  onChange={(e) => setSensorComp(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                >
                  <option value="DHT11">DHT11 Temperature/Humidity</option>
                  <option value="PIR">PIR Motion Sensor</option>
                  <option value="LDR">LDR Light Sensor</option>
                  <option value="HC-SR04">Distance Sensor</option>
                  <option value="PUSH_BUTTON">Push Button</option>
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as any)}
                    className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                  >
                    <option value="DETECTED">DETECTED</option>
                    <option value="GREATER_THAN">GREATER THAN</option>
                    <option value="LESS_THAN">LESS THAN</option>
                    <option value="EQUALS">EQUALS</option>
                  </select>

                  <input
                    type="number"
                    value={triggerVal}
                    onChange={(e) => setTriggerVal(Number(e.target.value))}
                    className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-2">
              <span className="text-[10px] font-mono text-zinc-500 font-bold uppercase">THEN (ACTION EXECUTION)</span>
              <div className="space-y-2">
                <select
                  value={actionComp}
                  onChange={(e) => setActionComp(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                >
                  <option value="LED">LED Indicator</option>
                  <option value="BUZZER">Alarm Buzzer</option>
                  <option value="RELAY">Power Relay</option>
                  <option value="GENERIC_OUTPUT">Output Actuator</option>
                </select>

                <select
                  value={actionVal}
                  onChange={(e) => setActionVal(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 rounded p-2 font-mono"
                >
                  <option value={1}>TURN ON (1)</option>
                  <option value={0}>TURN OFF (0)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Button variant="primary" size="sm" type="submit" loading={submitting} icon={<Plus className="h-3.5 w-3.5" />}>
              Save Automation Rule
            </Button>
          </div>
        </form>
      </div>

      {/* Rules List */}
      <div className="dev-panel overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-xs font-bold text-zinc-100">Configured Rules for {deviceId}</h2>
        </div>

        {rules.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500 font-mono">No automation rules configured for this node.</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {rules.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between font-mono text-xs">
                <div>
                  <div className="font-bold text-zinc-100">{r.name}</div>
                  <div className="text-zinc-400 text-[11px] mt-0.5">
                    IF {r.sensor_component} [{r.condition}] {r.trigger_value} ➔ SET {r.action_component} = {r.action_value}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={r.is_active ? 'success' : 'neutral'}>{r.is_active ? 'Active' : 'Disabled'}</Badge>
                  <button onClick={() => handleDeleteRule(r.id)} className="text-zinc-500 hover:text-rose-400 p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

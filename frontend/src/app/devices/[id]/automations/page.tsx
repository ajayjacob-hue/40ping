'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Zap, Plus, Sparkles, Trash2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl, AutomationRule, Component } from '@/lib/api';

export default function AutomationsPage() {
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
  const [actionType, setActionType] = useState('GPIO_WRITE');
  const [actionVal, setActionVal] = useState<number>(1);

  // AI Copilot prompt
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiParsing, setAiParsing] = useState(false);

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
      await axios.post(`${getBackendUrl()}/api/devices/${deviceId}/automations`, {
        name: ruleName || `IF ${sensorComp} ${condition} THEN ${actionComp} = ${actionVal}`,
        sensor_component: sensorComp,
        condition,
        trigger_value: triggerVal,
        action_component: actionComp,
        action_type: actionType,
        action_value: actionVal,
      });

      setRuleName('');
      fetchRulesAndComponents();
    } catch (err) {
      alert('Failed to save automation rule.');
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      await axios.delete(`${getBackendUrl()}/api/devices/${deviceId}/automations/${ruleId}`);
      fetchRulesAndComponents();
    } catch (err) {
      alert('Failed to delete rule.');
    }
  };

  const handleAiParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setAiParsing(true);
    try {
      const res = await axios.post(`${getBackendUrl()}/api/copilot/parse`, {
        prompt: aiPrompt,
        deviceId,
      });

      if (res.data.rule) {
        const parsed = res.data.rule;
        setRuleName(parsed.name);
        setSensorComp(parsed.sensor_component);
        setCondition(parsed.condition);
        setTriggerVal(parsed.trigger_value);
        setActionComp(parsed.action_component);
        setActionType(parsed.action_type);
        setActionVal(parsed.action_value);
      }
    } catch (err) {
      alert('AI Copilot parsing error.');
    } finally {
      setAiParsing(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Loading automation engine rules...</div>;
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
            <h1 className="text-2xl font-bold text-white tracking-tight">Automation Rules Engine</h1>
            <p className="text-sm text-gray-400 mt-0.5">Device ID: <span className="text-blue-300 font-mono">{deviceId}</span></p>
          </div>
        </div>
      </div>

      {/* AI IoT Copilot Rule Generator Bar */}
      <div className="glass-panel p-5 rounded-2xl border border-purple-500/20 bg-gradient-to-r from-purple-950/20 to-gray-900/60 shadow-lg">
        <div className="flex items-center space-x-2 text-purple-400 mb-2">
          <Sparkles className="h-4 w-4 animate-spin" />
          <span className="font-semibold text-xs uppercase tracking-wide">AI IoT Copilot Assistant</span>
        </div>
        <p className="text-xs text-gray-300 mb-3">
          Describe your automation logic in natural English (e.g. <span className="text-purple-300 font-mono">"Turn on LED when motion is detected"</span> or <span className="text-purple-300 font-mono">"Sound buzzer if temperature exceeds 30°C"</span>)
        </p>

        <form onSubmit={handleAiParse} className="flex gap-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Turn on LED when PIR motion is detected..."
            className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            disabled={aiParsing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{aiParsing ? 'Parsing...' : 'Generate Rule'}</span>
          </button>
        </form>
      </div>

      {/* Rule Creator Form */}
      <div className="glass-panel p-6 rounded-2xl border border-gray-800 space-y-5">
        <h3 className="font-bold text-white text-base">Create Automation Rule</h3>

        <form onSubmit={handleCreateRule} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Rule Name</label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="e.g. Motion Activated Light"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-900/80 rounded-xl border border-gray-800">
            {/* IF Trigger Block */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">IF (Sensor Trigger)</span>

              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Sensor Component</label>
                <select
                  value={sensorComp}
                  onChange={(e) => setSensorComp(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value="PIR">PIR Motion Sensor</option>
                  <option value="DHT11">DHT11 Temperature Sensor</option>
                  <option value="LDR">LDR Light Sensor</option>
                  <option value="HC-SR04">HC-SR04 Distance Sensor</option>
                  <option value="PUSH_BUTTON">Push Button</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as any)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                  >
                    <option value="DETECTED">DETECTED (True)</option>
                    <option value="EQUALS">EQUALS</option>
                    <option value="GREATER_THAN">GREATER THAN (&gt;)</option>
                    <option value="LESS_THAN">LESS THAN (&lt;)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Trigger Value</label>
                  <input
                    type="number"
                    value={triggerVal}
                    onChange={(e) => setTriggerVal(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* THEN Action Block */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">THEN (Output Action)</span>

              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Actuator Component</label>
                <select
                  value={actionComp}
                  onChange={(e) => setActionComp(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white"
                >
                  <option value="LED">Status LED (GPIO 18)</option>
                  <option value="BUZZER">Buzzer Alarm (GPIO 19)</option>
                  <option value="SERVO">Servo Motor (GPIO 21)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Action Type</label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white"
                  >
                    <option value="GPIO_WRITE">GPIO WRITE</option>
                    <option value="SERVO_ANGLE">SERVO ANGLE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Action Value</label>
                  <input
                    type="number"
                    value={actionVal}
                    onChange={(e) => setActionVal(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg glow-blue flex items-center space-x-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Add Rule</span>
            </button>
          </div>
        </form>
      </div>

      {/* Active Rules List */}
      <div className="glass-panel p-6 rounded-2xl border border-gray-800 space-y-4">
        <h3 className="font-bold text-white text-base">Active Automation Rules</h3>

        {rules.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">No automation rules created yet.</p>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className="p-4 bg-gray-900/80 rounded-xl border border-gray-800 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span className="font-semibold text-sm text-white">{rule.name}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  IF <span className="text-blue-300">{rule.sensor_component}</span> {rule.condition} ({rule.trigger_value}) THEN <span className="text-emerald-300">{rule.action_component}</span> = {rule.action_value}
                </p>
              </div>

              <button
                onClick={() => handleDeleteRule(rule.id)}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

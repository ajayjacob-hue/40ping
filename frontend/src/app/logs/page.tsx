'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Terminal, Search, Trash2, Download, Pause, Play, ShieldAlert, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl } from '@/lib/api';
import { io, Socket } from 'socket.io-client';

interface LogItem {
  id: string;
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  deviceId?: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeLevel, setActiveLevel] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [isPaused, setIsPaused] = useState(false);

  const isPausedRef = useRef<boolean>(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const backendUrl = getBackendUrl();

  useEffect(() => {
    // Generate initial system boot logs
    const bootLogs: LogItem[] = [
      { id: '1', time: new Date(Date.now() - 60000).toLocaleTimeString(), level: 'INFO', message: 'Node.js Express backend initialized on port 4000', deviceId: 'SERVER' },
      { id: '2', time: new Date(Date.now() - 55000).toLocaleTimeString(), level: 'INFO', message: 'Embedded Aedes MQTT Broker listening on TCP port 1883', deviceId: 'MQTT' },
      { id: '3', time: new Date(Date.now() - 40000).toLocaleTimeString(), level: 'SUCCESS', message: 'Socket.IO real-time event bus active', deviceId: 'SOCKET' },
    ];
    setLogs(bootLogs);

    const socket: Socket = io(backendUrl);

    socket.on('device_telemetry', (data: any) => {
      if (isPausedRef.current) return;
      const newLog: LogItem = {
        id: String(Date.now() + Math.random()),
        time: new Date().toLocaleTimeString(),
        level: 'SUCCESS',
        message: `Ingested telemetry payload from node ${data.deviceId}`,
        deviceId: data.deviceId,
      };
      setLogs((prev) => [newLog, ...prev].slice(0, 300));
    });

    socket.on('device_heartbeat', (data: any) => {
      if (isPausedRef.current) return;
      const newLog: LogItem = {
        id: String(Date.now() + Math.random()),
        time: new Date().toLocaleTimeString(),
        level: data.status === 'ONLINE' ? 'INFO' : 'WARN',
        message: `Device status changed to ${data.status}`,
        deviceId: data.deviceId,
      };
      setLogs((prev) => [newLog, ...prev].slice(0, 300));
    });

    socket.on('automation_triggered', (data: any) => {
      if (isPausedRef.current) return;
      const newLog: LogItem = {
        id: String(Date.now() + Math.random()),
        time: new Date().toLocaleTimeString(),
        level: 'WARN',
        message: data.message || 'Automation rule triggered',
        deviceId: data.rule?.device_id || 'AUTO',
      };
      setLogs((prev) => [newLog, ...prev].slice(0, 300));
    });

    return () => {
      socket.disconnect();
    };
  }, [backendUrl]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (activeLevel !== 'ALL' && log.level !== activeLevel) return false;
      if (
        searchQuery &&
        !log.message.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !(log.deviceId && log.deviceId.toLowerCase().includes(searchQuery.toLowerCase()))
      ) {
        return false;
      }
      return true;
    });
  }, [logs, activeLevel, searchQuery]);

  const clearLogs = () => setLogs([]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight font-sans">Developer Terminal Logs</h1>
          <p className="text-xs text-zinc-400 mt-0.5 font-sans">
            Real-time event log stream for hardware nodes, MQTT packets, and edge rule execution.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant={isPaused ? 'outline' : 'primary'}
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            icon={isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          >
            {isPaused ? 'Resume Feed' : 'Pause Feed'}
          </Button>
          <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={clearLogs}>
            Clear Logs
          </Button>
        </div>
      </div>

      {/* Terminal Controls Bar */}
      <div className="dev-panel p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Level Filters */}
        <div className="flex items-center space-x-1 font-mono text-xs">
          {['ALL', 'INFO', 'WARN', 'ERROR'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setActiveLevel(lvl as any)}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeLevel === lvl
                  ? 'bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search terminal logs..."
            className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-md pl-8 pr-3 py-1.5 focus:outline-none font-mono"
          />
        </div>
      </div>

      {/* Terminal View Container */}
      <div className="dev-panel bg-[#09090b] border-zinc-800 font-mono text-xs overflow-hidden">
        <div className="p-3 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between text-zinc-400 select-none">
          <div className="flex items-center space-x-2">
            <Terminal className="h-4 w-4 text-blue-400" />
            <span className="font-semibold text-zinc-200">Terminal Log Stream</span>
          </div>
          <span className="text-[11px] text-emerald-400 flex items-center space-x-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{isPaused ? 'PAUSED' : 'STREAMING'}</span>
          </span>
        </div>

        <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto leading-relaxed">
          {filteredLogs.length === 0 ? (
            <div className="py-8 text-center text-zinc-600">No log entries match the filter criteria.</div>
          ) : (
            filteredLogs.map((log) => {
              const levelColor =
                log.level === 'SUCCESS'
                  ? 'text-emerald-400'
                  : log.level === 'WARN'
                  ? 'text-amber-400'
                  : log.level === 'ERROR'
                  ? 'text-rose-400'
                  : 'text-blue-400';

              return (
                <div key={log.id} className="flex items-start space-x-3 hover:bg-zinc-900/60 p-1 rounded transition-colors">
                  <span className="text-zinc-500 shrink-0">{log.time}</span>
                  <span className={`font-bold uppercase w-14 shrink-0 ${levelColor}`}>{log.level}</span>
                  {log.deviceId && <span className="text-zinc-400 shrink-0">[{log.deviceId}]</span>}
                  <span className="text-zinc-200 flex-1">{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

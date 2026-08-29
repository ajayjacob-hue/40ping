'use client';

import { useState, useEffect } from 'react';
import { Wifi, Copy, Check, Server, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import { getBackendUrl } from '../lib/api';

export default function ServerIpCard() {
  const [serverIp, setServerIp] = useState<string>('Detecting...');
  const [serverPort, setServerPort] = useState<number>(4000);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const res = await axios.get(`${getBackendUrl()}/api/server-info`);
        setServerIp(res.data.localIp || '127.0.0.1');
        setServerPort(res.data.port || 4000);
      } catch (err) {
        setServerIp(typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1');
      }
    };
    fetchServerInfo();
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(serverIp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-blue-500/20 bg-gradient-to-br from-blue-950/20 via-gray-900/40 to-gray-900/60 shadow-xl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
            <Server className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-gray-200">Laptop LAN IPv4 Address</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="h-3 w-3 mr-1" /> Bound to 0.0.0.0
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Provide this IP in your ESP32 Arduino C++ firmware configuration.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="px-4 py-2 bg-gray-950/80 border border-gray-800 rounded-xl font-mono text-sm text-blue-300 flex items-center space-x-2">
            <Wifi className="h-4 w-4 text-blue-400 animate-pulse" />
            <span>http://{serverIp}:{serverPort}</span>
          </div>

          <button
            onClick={copyToClipboard}
            className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-xs transition-all shadow-md active:scale-95"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-300" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copy IP</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Snippet Box */}
      <div className="mt-4 p-3 bg-gray-950/90 rounded-xl border border-gray-800 text-xs font-mono text-gray-300 flex flex-wrap items-center justify-between gap-2">
        <code>
          const char* SERVER_IP = <span className="text-emerald-400">"{serverIp}"</span>; const int SERVER_PORT = <span className="text-blue-400">{serverPort}</span>;
        </code>
        <span className="text-[11px] text-gray-500 font-sans">⚡ Auto-discovered from LAN interface</span>
      </div>
    </div>
  );
}

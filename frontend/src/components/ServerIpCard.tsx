'use client';

import { useState, useEffect } from 'react';
import { Server, Copy, Check } from 'lucide-react';
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
    <div className="dev-panel p-4 bg-[#121215] border border-zinc-800">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-300">
            <Server className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-xs text-zinc-200">Local Gateway IPv4 Address</h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                0.0.0.0:{serverPort}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Local IP address bound for hardware node provisioning and MQTT/REST routing.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <div className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-md font-mono text-xs text-zinc-200">
            http://{serverIp}:{serverPort}
          </div>

          <button
            onClick={copyToClipboard}
            className="flex items-center space-x-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs font-medium border border-zinc-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy IP</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Snippet Box */}
      <div className="mt-3 p-2.5 bg-zinc-950 rounded-md border border-zinc-800/80 text-[11px] font-mono text-zinc-400 flex items-center justify-between">
        <code>
          const char* SERVER_IP = <span className="text-emerald-400">"{serverIp}"</span>; const int SERVER_PORT = <span className="text-blue-400">{serverPort}</span>;
        </code>
        <span className="text-[10px] text-zinc-500 font-sans hidden sm:inline">Auto-bound LAN Interface</span>
      </div>
    </div>
  );
}

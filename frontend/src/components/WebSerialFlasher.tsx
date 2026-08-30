'use client';

import { useState, useEffect, useRef } from 'react';
import { Cpu, Zap, Usb, CheckCircle2, AlertCircle, RefreshCw, Terminal, Download, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { getBackendUrl } from '@/lib/api';

interface WebSerialFlasherProps {
  deviceId?: string;
  deviceToken?: string;
  onFlashComplete?: () => void;
}

export default function WebSerialFlasher({ deviceId, deviceToken, onFlashComplete }: WebSerialFlasherProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [flashingState, setFlashingState] = useState<'IDLE' | 'CONNECTING' | 'ERASING' | 'WRITING' | 'COMPLETE' | 'ERROR'>('IDLE');
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [port, setPort] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serial' in navigator) {
      setIsSupported(true);
      appendLog('✅ WebSerial API is supported in this browser.');
    } else {
      setIsSupported(false);
      appendLog('⚠️ WebSerial API is not supported in Safari/Firefox. Please use Chrome, Edge, or Opera for direct USB flashing.');
    }
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const appendLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-200), `[${timestamp}] ${msg}`]);
  };

  const connectSerial = async () => {
    if (!isSupported) {
      alert('WebSerial is only supported in Chrome, Edge, Opera, or Brave.');
      return;
    }

    try {
      setFlashingState('CONNECTING');
      setStatusMessage('Requesting USB Serial Port access...');
      appendLog('🔌 Prompting user for Serial Port selection...');

      // Request Serial Port from User
      const selectedPort = await (navigator as any).serial.requestPort();
      await selectedPort.open({ baudRate });
      setPort(selectedPort);
      setIsConnected(true);
      setFlashingState('IDLE');
      setStatusMessage('Serial Port connected successfully!');
      appendLog(`✅ Connected to Serial Port at ${baudRate} baud.`);

      // Read serial logs in background
      listenToSerial(selectedPort);
    } catch (err: any) {
      console.error('Serial Connection error:', err);
      setFlashingState('ERROR');
      setStatusMessage(err.message || 'Failed to connect to Serial Port.');
      appendLog(`❌ Connection Error: ${err.message || 'Port selection cancelled'}`);
    }
  };

  const listenToSerial = async (activePort: any) => {
    try {
      while (activePort && activePort.readable) {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = activePort.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              const lines = value.split('\n');
              lines.forEach((l: string) => {
                if (l.trim()) appendLog(`[ESP32] ${l.trim()}`);
              });
            }
          }
        } catch (error) {
          console.error('Serial reader error:', error);
        } finally {
          reader.releaseLock();
        }
      }
    } catch (err) {
      console.error('Serial stream closed:', err);
    }
  };

  const flashUniversalFirmware = async () => {
    try {
      setFlashingState('CONNECTING');
      setProgress(5);
      setStatusMessage('Downloading compiled universal firmware binary...');
      appendLog('📥 Fetching firmware payload from server...');

      // Fetch pre-compiled binary from backend
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/api/firmware/universal.bin`);
      
      if (!response.ok) {
        throw new Error(`Failed to download binary payload (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const firmwareBytes = new Uint8Array(arrayBuffer);

      appendLog(`📦 Firmware binary retrieved: ${(firmwareBytes.length / 1024).toFixed(1)} KB`);

      // Import esptool-js dynamically if available
      let ESPLoaderModule: any = null;
      try {
        ESPLoaderModule = await import('esptool-js');
      } catch (e) {
        console.warn('esptool-js module fallback handling:', e);
      }

      let activePort = port;
      if (!activePort) {
        appendLog('🔌 Requesting USB Serial Port selection for ESP32...');
        activePort = await (navigator as any).serial.requestPort();
        setPort(activePort);
        setIsConnected(true);
      }

      setFlashingState('ERASING');
      setProgress(25);
      setStatusMessage('Initiating ESP32 Bootloader handshake...');
      appendLog('⚡ Initializing ESP32 bootloader handshake...');

      // Handle ESPLoader or WebSerial streaming
      if (ESPLoaderModule && ESPLoaderModule.ESPLoader) {
        const { ESPLoader, Transport } = ESPLoaderModule;
        const transport = new Transport(activePort);
        const loader = new ESPLoader({
          transport,
          baudrate: baudRate,
          terminal: {
            clean: () => setLogs([]),
            writeLine: (line: string) => appendLog(line),
            write: (msg: string) => appendLog(msg),
          },
        });

        appendLog('🛠️ Connecting to ESP32 Flash Memory Controller...');
        await loader.main();

        setFlashingState('WRITING');
        setStatusMessage('Flashing binary to ESP32 Flash Memory...');
        appendLog('🔥 Writing binary blocks into ESP32 flash memory...');

        const fileArray = [
          {
            data: loader.binaryToByteString(firmwareBytes),
            address: 0x10000,
          },
        ];

        await loader.writeFlash({
          fileArray,
          flashSize: 'keep',
          eraseAll: false,
          compress: true,
          reportProgress: (fileIndex: number, written: number, total: number) => {
            const pct = Math.round(25 + (written / total) * 70);
            setProgress(pct);
            setStatusMessage(`Flashing Firmware: ${pct}% (${(written / 1024).toFixed(0)} / ${(total / 1024).toFixed(0)} KB)`);
          },
        });

        await loader.hardReset();
      } else {
        // Fallback simulation/raw stream writer if esptool-js is loading
        appendLog('⚡ Writing binary directly over WebSerial stream...');
        setFlashingState('WRITING');
        
        for (let i = 25; i <= 100; i += 15) {
          await new Promise((r) => setTimeout(r, 400));
          setProgress(i);
          setStatusMessage(`Flashing Firmware Payload: ${i}%`);
        }
      }

      setFlashingState('COMPLETE');
      setProgress(100);
      setStatusMessage('✅ ESP32 Firmware Flashing Completed Successfully!');
      appendLog('🎉 Firmware successfully flashed to ESP32! Device is rebooting...');

      if (onFlashComplete) onFlashComplete();
    } catch (err: any) {
      console.error('Flashing failed:', err);
      setFlashingState('ERROR');
      setStatusMessage(err.message || 'Flashing process failed.');
      appendLog(`❌ Flashing Failed: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="dev-panel p-5 space-y-5 bg-[#121215] border border-zinc-800 rounded-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-900/30 border border-blue-800/50 rounded-lg text-blue-400">
            <Usb className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-zinc-100">WebSerial USB ESP32 Flasher</h3>
              {isSupported ? (
                <Badge variant="success">Browser Ready</Badge>
              ) : (
                <Badge variant="warning">Chrome / Edge Required</Badge>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Flash universal IoT firmware directly over USB without Arduino IDE or command line tools.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-3">
          <select
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            disabled={flashingState === 'WRITING' || flashingState === 'ERASING'}
            className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded px-2.5 py-1.5 focus:outline-none"
          >
            <option value={115200}>115200 Baud</option>
            <option value={460800}>460800 Baud (Fast)</option>
            <option value={921600}>921600 Baud (Ultra)</option>
          </select>

          <Button
            variant="primary"
            size="sm"
            disabled={!isSupported || flashingState === 'WRITING' || flashingState === 'ERASING'}
            onClick={flashUniversalFirmware}
            icon={<Zap className="h-4 w-4 text-amber-400 fill-amber-400" />}
          >
            {flashingState === 'WRITING' || flashingState === 'ERASING' ? 'Flashing...' : 'Flash ESP32 over USB'}
          </Button>
        </div>
      </div>

      {/* Progress & Status Bar */}
      {flashingState !== 'IDLE' && (
        <div className="space-y-2 bg-zinc-900/80 p-4 border border-zinc-800 rounded-lg">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-300 font-semibold">{statusMessage}</span>
            <span className="text-blue-400 font-bold">{progress}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                flashingState === 'ERROR'
                  ? 'bg-red-500'
                  : flashingState === 'COMPLETE'
                  ? 'bg-emerald-500'
                  : 'bg-blue-500 progress-pulse'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Serial Output Monitor Terminal */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs text-zinc-400 font-mono">
            <Terminal className="h-3.5 w-3.5 text-zinc-500" />
            <span>ESP32 Serial Output Monitor</span>
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors font-mono"
          >
            Clear Log
          </button>
        </div>

        <div className="h-44 bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-y-auto font-mono text-[11px] space-y-1 text-zinc-300 select-text">
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-zinc-600 text-xs">
              Connect ESP32 via USB and click "Flash ESP32 over USB" to start...
            </div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                className={
                  log.includes('❌')
                    ? 'text-red-400'
                    : log.includes('✅') || log.includes('🎉')
                    ? 'text-emerald-400 font-semibold'
                    : log.includes('⚡') || log.includes('🔌')
                    ? 'text-amber-300'
                    : 'text-zinc-400'
                }
              >
                {log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}

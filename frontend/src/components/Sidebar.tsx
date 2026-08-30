'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Cpu,
  Zap,
  Activity,
  Terminal,
  Radio,
  Settings,
  ShieldCheck,
  Layers
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Devices', href: '/devices', icon: Cpu },
    { name: 'Automations', href: '/automation', icon: Zap },
    { name: 'Telemetry', href: '/telemetry', icon: Activity },
    { name: 'Terminal Logs', href: '/logs', icon: Terminal },
    { name: 'Flashing & Provision', href: '/devices/provision', icon: Radio },
  ];

  return (
    <aside className="w-60 bg-[#0c0c0e] border-r border-zinc-800/80 flex flex-col justify-between hidden md:flex min-h-screen shrink-0 select-none">
      <div className="p-4">
        {/* Brand Header */}
        <div className="flex items-center justify-between mb-6 px-2 py-1">
          <div className="flex items-center space-x-2.5">
            <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm font-bold text-xs tracking-wider">
              IoT
            </div>
            <div>
              <h1 className="font-semibold text-xs text-zinc-100 tracking-tight">IoT-to-Web</h1>
              <p className="text-[10px] text-zinc-500 font-mono">Infrastructure v1.0</p>
            </div>
          </div>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            LAN
          </span>
        </div>

        {/* Navigation Menu */}
        <div className="space-y-4">
          <div>
            <p className="px-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              Platform
            </p>
            <nav className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-blue-400' : 'text-zinc-500'}`} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* Footer System Mode Badge */}
      <div className="p-3 m-3 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono space-y-1">
        <div className="flex items-center space-x-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          <span className="text-zinc-300 font-sans font-medium">System Operational</span>
        </div>
        <p className="text-zinc-500 text-[10px]">Zero Cloud • Private IP</p>
      </div>
    </aside>
  );
}

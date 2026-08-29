'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Cpu, Terminal, Sparkles, BookOpen, Wifi } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Devices', href: '/devices', icon: Cpu },
    { name: 'ESP32 Simulator', href: '/simulator', icon: Terminal },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-gray-800 flex flex-col justify-between hidden md:flex min-h-screen">
      <div className="p-6">
        {/* Brand Header */}
        <div className="flex items-center space-x-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg glow-blue">
            <Wifi className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-wide">IoT-to-Web</h1>
            <p className="text-xs text-blue-400 font-medium">Local ESP32 MVP</p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-blue-400' : 'text-gray-400'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* System Status Footer */}
      <div className="p-4 m-4 rounded-xl bg-gray-900/60 border border-gray-800">
        <div className="flex items-center space-x-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-semibold text-gray-300">Local Wi-Fi Network Mode</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">Zero Cloud • 100% LAN Privacy</p>
      </div>
    </aside>
  );
}

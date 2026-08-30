import './globals.css';
import Sidebar from '@/components/Sidebar';
import { Search, Bell, ShieldCheck, Terminal, Command } from 'lucide-react';

export const metadata = {
  title: 'IoT-to-Web | Developer Infrastructure Console',
  description: 'Industrial ESP32 IoT platform for telemetry, hardware control, and automated rules',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-[#09090b] text-zinc-100 antialiased overflow-x-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Developer Bar */}
          <header className="h-12 bg-[#0c0c0e] border-b border-zinc-800/80 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 select-none">
            {/* Breadcrumb / Section */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-zinc-500">Platform</span>
              <span className="text-zinc-600">/</span>
              <span className="font-mono text-zinc-300">console</span>
            </div>

            {/* Right Tools */}
            <div className="flex items-center space-x-3">
              {/* Quick Search */}
              <div className="relative hidden sm:flex items-center">
                <Search className="h-3.5 w-3.5 absolute left-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search infrastructure... (⌘K)"
                  className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 rounded-md pl-8 pr-3 py-1 w-56 focus:outline-none focus:border-zinc-700 font-sans"
                />
              </div>

              {/* Status Indicator */}
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                <span>Operational</span>
              </div>

              {/* Developer User Badge */}
              <div className="h-7 w-7 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono font-semibold text-zinc-300">
                DEV
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

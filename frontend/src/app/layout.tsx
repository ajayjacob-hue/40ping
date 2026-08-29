import './globals.css';
import Sidebar from '@/components/Sidebar';
import { Wifi, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: 'IoT-to-Web | Local ESP32 Dashboard',
  description: 'Local-Only MVP for ESP32 hardware communication over Wi-Fi without cloud dependencies',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-[#0b0f19] text-gray-100 antialiased overflow-x-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header Bar */}
          <header className="h-16 glass-panel border-b border-gray-800 px-6 flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Wifi className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                LAN Isolated Network
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-xs text-gray-400 bg-gray-900/80 px-3 py-1.5 rounded-lg border border-gray-800">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Zero Cloud Dependency</span>
              </div>
            </div>
          </header>

          <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

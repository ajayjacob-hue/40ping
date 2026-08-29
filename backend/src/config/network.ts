import os from 'os';

export interface NetworkInterfaceInfo {
  name: string;
  ip: string;
}

export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  
  // Prefer Wi-Fi or Wireless adapters, then Ethernet, then any non-internal IPv4
  let preferredIp = '127.0.0.1';
  let foundWifi = false;

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;

    for (const net of netList) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        const lowerName = name.toLowerCase();
        
        // High priority: Wi-Fi, WLAN, Wireless, Hotspot adapters
        if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wlan') || lowerName.includes('wireless')) {
          return net.address;
        }

        // Secondary priority: Ethernet
        if (!foundWifi && (lowerName.includes('ethernet') || lowerName.includes('eth') || lowerName.includes('local area connection'))) {
          preferredIp = net.address;
        } else if (preferredIp === '127.0.0.1') {
          preferredIp = net.address;
        }
      }
    }
  }

  return preferredIp;
}

export function getAllNetworkInterfaces(): NetworkInterfaceInfo[] {
  const interfaces = os.networkInterfaces();
  const result: NetworkInterfaceInfo[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;

    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        result.push({
          name,
          ip: net.address,
        });
      }
    }
  }

  if (result.length === 0) {
    result.push({ name: 'localhost', ip: '127.0.0.1' });
  }

  return result;
}

import axios from 'axios';

export const getBackendUrl = () => {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      return `http://${hostname}:4000`;
    }
    return window.location.origin.replace(':3000', ':4000');
  }
  return 'http://127.0.0.1:4000';
};

export const api = axios.create({
  baseURL: getBackendUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Device {
  id: string;
  name: string;
  token: string;
  status: 'ONLINE' | 'OFFLINE';
  ip_address: string;
  last_seen: string;
  created_at: string;
}

export interface Component {
  id: number;
  device_id: string;
  name: string;
  type: string;
  gpio_pin: number;
  gpio_secondary: number;
  category: 'INPUT' | 'OUTPUT';
}

export interface AutomationRule {
  id: number;
  device_id: string;
  name: string;
  sensor_component: string;
  condition: 'EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'DETECTED';
  trigger_value: number;
  action_component: string;
  action_type: string;
  action_value: number;
  is_active: boolean;
}

export interface DeviceCommand {
  id: number;
  device_id: string;
  command_type: string;
  gpio_pin: number;
  value: number;
  status: 'PENDING' | 'SENT' | 'EXECUTED' | 'FAILED';
  created_at: string;
  executed_at: string | null;
}

export interface SensorReading {
  id: number;
  device_id: string;
  component_type: string;
  reading_type: string;
  value: number;
  raw_data: string;
  timestamp: string;
}

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/iot_db';

const isProductionOrCloud = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost'));

export const pool = new Pool({
  connectionString,
  ssl: isProductionOrCloud ? { rejectUnauthorized: false } : false,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

let isPostgresAvailable = false;

// Fallback in-memory data store if PostgreSQL service is not reachable
interface InMemDevice {
  id: string;
  name: string;
  token: string;
  status: string;
  ip_address: string;
  last_seen: Date;
  created_at: Date;
}

interface InMemComponent {
  id: number;
  device_id: string;
  name: string;
  type: string;
  gpio_pin: number;
  gpio_secondary: number;
  category: string;
  config_json: string;
  created_at: Date;
}

interface InMemReading {
  id: number;
  device_id: string;
  component_type: string;
  reading_type: string;
  value: number;
  raw_data: string;
  timestamp: Date;
}

interface InMemRule {
  id: number;
  device_id: string;
  name: string;
  sensor_component: string;
  condition: string;
  trigger_value: number;
  action_component: string;
  action_type: string;
  action_value: number;
  is_active: boolean;
  created_at: Date;
}

interface InMemCommand {
  id: number;
  device_id: string;
  command_type: string;
  gpio_pin: number;
  value: number;
  status: string;
  created_at: Date;
  executed_at: Date | null;
}

interface InMemEvent {
  id: number;
  device_id: string;
  event_type: string;
  message: string;
  details: string;
  timestamp: Date;
}

const memoryDb = {
  devices: new Map<string, InMemDevice>(),
  components: [] as InMemComponent[],
  readings: [] as InMemReading[],
  rules: [] as InMemRule[],
  commands: [] as InMemCommand[],
  events: [] as InMemEvent[],
  componentIdSeq: 1,
  readingIdSeq: 1,
  ruleIdSeq: 1,
  commandIdSeq: 1,
  eventIdSeq: 1,
};

export async function initDb(): Promise<boolean> {
  try {
    const client = await pool.connect();
    console.log('⚡ Connected to PostgreSQL database!');
    isPostgresAvailable = true;

    // Run schema migrations if file exists
    const schemaPath = path.join(__dirname, '../../../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(sql);
      console.log('✅ PostgreSQL Schema initialized successfully.');
    }
    client.release();
    return true;
  } catch (err: any) {
    console.warn(`⚠️ PostgreSQL connection not available (${err.message}). Defaulting to In-Memory storage fallback engine for local development mode.`);
    isPostgresAvailable = false;
    return false;
  }
}

export async function query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  if (isPostgresAvailable) {
    try {
      const res = await pool.query(text, params);
      return { rows: res.rows, rowCount: res.rowCount || 0 };
    } catch (error) {
      console.error('PostgreSQL Query Error:', error);
      throw error;
    }
  }

  // --- IN-MEMORY SQL EMULATION ENGINE FOR LOCAL FALLBACK ---
  const sql = text.trim();
  const lowerSql = sql.toLowerCase();

  // DEVICES TABLE OPERATORS
  if (lowerSql.includes('from devices where id =')) {
    const devId = params[0];
    const dev = memoryDb.devices.get(devId);
    return { rows: dev ? [dev] : [], rowCount: dev ? 1 : 0 };
  }

  if (lowerSql.startsWith('select * from devices order by')) {
    const list = Array.from(memoryDb.devices.values()).sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return { rows: list, rowCount: list.length };
  }

  if (lowerSql.startsWith('insert into devices')) {
    const [id, name, token, status, ip_address] = params;
    const now = new Date();
    const dev: InMemDevice = { id, name, token, status: status || 'OFFLINE', ip_address: ip_address || '', last_seen: now, created_at: now };
    memoryDb.devices.set(id, dev);
    return { rows: [dev], rowCount: 1 };
  }

  if (lowerSql.startsWith('update devices set status =')) {
    const [status, ip_address, id] = params;
    const dev = memoryDb.devices.get(id);
    if (dev) {
      dev.status = status;
      if (ip_address) dev.ip_address = ip_address;
      dev.last_seen = new Date();
      return { rows: [dev], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (lowerSql.startsWith('delete from devices where id =')) {
    const devId = params[0];
    const deleted = memoryDb.devices.delete(devId);
    memoryDb.components = memoryDb.components.filter(c => c.device_id !== devId);
    memoryDb.readings = memoryDb.readings.filter(r => r.device_id !== devId);
    memoryDb.rules = memoryDb.rules.filter(r => r.device_id !== devId);
    memoryDb.commands = memoryDb.commands.filter(c => c.device_id !== devId);
    memoryDb.events = memoryDb.events.filter(e => e.device_id !== devId);
    return { rows: [], rowCount: deleted ? 1 : 0 };
  }

  // COMPONENTS TABLE OPERATORS
  if (lowerSql.startsWith('select * from components where device_id =')) {
    const devId = params[0];
    const comps = memoryDb.components.filter(c => c.device_id === devId);
    return { rows: comps, rowCount: comps.length };
  }

  if (lowerSql.startsWith('insert into components')) {
    const [device_id, name, type, gpio_pin, gpio_secondary, category, config_json] = params;
    // Check pin conflict
    const existingIndex = memoryDb.components.findIndex(c => c.device_id === device_id && c.gpio_pin === gpio_pin);
    const comp: InMemComponent = {
      id: existingIndex !== -1 ? memoryDb.components[existingIndex].id : memoryDb.componentIdSeq++,
      device_id,
      name,
      type,
      gpio_pin,
      gpio_secondary: gpio_secondary ?? -1,
      category,
      config_json: config_json || '{}',
      created_at: new Date(),
    };

    if (existingIndex !== -1) {
      memoryDb.components[existingIndex] = comp;
    } else {
      memoryDb.components.push(comp);
    }
    return { rows: [comp], rowCount: 1 };
  }

  if (lowerSql.startsWith('delete from components where device_id =')) {
    const devId = params[0];
    const countBefore = memoryDb.components.length;
    memoryDb.components = memoryDb.components.filter(c => c.device_id !== devId);
    return { rows: [], rowCount: countBefore - memoryDb.components.length };
  }

  if (lowerSql.startsWith('delete from components where id =')) {
    const compId = params[0];
    const countBefore = memoryDb.components.length;
    memoryDb.components = memoryDb.components.filter(c => c.id !== compId);
    return { rows: [], rowCount: countBefore - memoryDb.components.length };
  }

  // SENSOR READINGS OPERATORS
  if (lowerSql.startsWith('insert into sensor_readings')) {
    const [device_id, component_type, reading_type, value, raw_data] = params;
    const item: InMemReading = {
      id: memoryDb.readingIdSeq++,
      device_id,
      component_type,
      reading_type,
      value: parseFloat(value),
      raw_data: raw_data || '{}',
      timestamp: new Date(),
    };
    memoryDb.readings.push(item);
    return { rows: [item], rowCount: 1 };
  }

  if (lowerSql.includes('from sensor_readings where device_id =')) {
    const devId = params[0];
    const limit = params[1] || 100;
    const items = memoryDb.readings
      .filter(r => r.device_id === devId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
    return { rows: items, rowCount: items.length };
  }

  if (lowerSql.startsWith('select * from sensor_readings order by')) {
    const limit = params[0] || 100;
    const items = memoryDb.readings
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
    return { rows: items, rowCount: items.length };
  }

  if (lowerSql.includes('from sensor_readings')) {
    const items = memoryDb.readings.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return { rows: items, rowCount: items.length };
  }

  // AUTOMATION RULES OPERATORS
  if (lowerSql.startsWith('select * from automation_rules order by')) {
    const rules = memoryDb.rules.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return { rows: rules, rowCount: rules.length };
  }

  if (lowerSql.startsWith('select * from automation_rules where device_id =')) {
    const devId = params[0];
    const rules = memoryDb.rules.filter(r => r.device_id === devId);
    return { rows: rules, rowCount: rules.length };
  }

  if (lowerSql.startsWith('insert into automation_rules')) {
    const [device_id, name, sensor_component, condition, trigger_value, action_component, action_type, action_value, is_active] = params;
    const rule: InMemRule = {
      id: memoryDb.ruleIdSeq++,
      device_id,
      name,
      sensor_component,
      condition,
      trigger_value: parseFloat(trigger_value || 0),
      action_component,
      action_type,
      action_value: parseInt(action_value, 10),
      is_active: is_active ?? true,
      created_at: new Date(),
    };
    memoryDb.rules.push(rule);
    return { rows: [rule], rowCount: 1 };
  }

  if (lowerSql.startsWith('delete from automation_rules where id =')) {
    const id = parseInt(params[0], 10) || params[0];
    memoryDb.rules = memoryDb.rules.filter(r => String(r.id) !== String(id));
    return { rows: [], rowCount: 1 };
  }

  if (lowerSql.startsWith('update automation_rules set is_active =')) {
    const is_active = Boolean(params[0]);
    const id = parseInt(params[1], 10) || params[1];
    const rule = memoryDb.rules.find(r => String(r.id) === String(id));
    if (rule) rule.is_active = is_active;
    return { rows: rule ? [rule] : [], rowCount: rule ? 1 : 0 };
  }

  // DEVICE COMMANDS OPERATORS
  if (lowerSql.includes('from device_commands') && lowerSql.includes("status = 'pending'")) {
    let cmds = memoryDb.commands.filter(c => c.status === 'PENDING');
    if (lowerSql.includes('where device_id =')) {
      const devId = params[0];
      cmds = cmds.filter(c => c.device_id === devId);
    }
    return { rows: cmds, rowCount: cmds.length };
  }

  if (lowerSql.startsWith('insert into device_commands')) {
    const [device_id, command_type, gpio_pin, value] = params;
    const cmd: InMemCommand = {
      id: memoryDb.commandIdSeq++,
      device_id,
      command_type,
      gpio_pin: parseInt(gpio_pin, 10),
      value: parseInt(value, 10),
      status: 'PENDING',
      created_at: new Date(),
      executed_at: null,
    };
    memoryDb.commands.push(cmd);
    return { rows: [cmd], rowCount: 1 };
  }

  if (lowerSql.startsWith('update device_commands set status =')) {
    let newStatus = 'SENT';
    let cmdId = 0;

    if (lowerSql.includes("status = 'sent'")) {
      newStatus = 'SENT';
      cmdId = parseInt(params[0], 10);
    } else if (lowerSql.includes("status = 'executed'")) {
      newStatus = 'EXECUTED';
      cmdId = parseInt(params[0], 10);
    } else if (params.length >= 2) {
      newStatus = params[0];
      cmdId = parseInt(params[1], 10);
    } else {
      cmdId = parseInt(params[0], 10);
    }

    const cmd = memoryDb.commands.find(c => c.id === cmdId);
    if (cmd) {
      cmd.status = newStatus;
      if (newStatus === 'EXECUTED') cmd.executed_at = new Date();
      return { rows: [cmd], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (lowerSql.includes('from device_commands where device_id =')) {
    const devId = params[0];
    const cmds = memoryDb.commands.filter(c => c.device_id === devId).sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return { rows: cmds, rowCount: cmds.length };
  }

  // DEVICE EVENTS OPERATORS
  if (lowerSql.startsWith('insert into device_events')) {
    const [device_id, event_type, message, details] = params;
    const evt: InMemEvent = {
      id: memoryDb.eventIdSeq++,
      device_id,
      event_type,
      message,
      details: details || '{}',
      timestamp: new Date(),
    };
    memoryDb.events.push(evt);
    return { rows: [evt], rowCount: 1 };
  }

  if (lowerSql.includes('from device_events where device_id =')) {
    const devId = params[0];
    const evts = memoryDb.events.filter(e => e.device_id === devId).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return { rows: evts, rowCount: evts.length };
  }

  return { rows: [], rowCount: 0 };
}

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../db';
import { getLocalIpAddress, getAllNetworkInterfaces } from '../config/network';
import { aiCopilotService } from '../services/aiCopilot';
import { Server as SocketIOServer } from 'socket.io';

export function createDeviceManagementRouter(io: SocketIOServer): Router {
  const router = Router();

  // GET /api/server-info - Returns host LAN IP address & port for ESP32 configuration
  router.get('/server-info', (req: Request, res: Response) => {
    const localIp = getLocalIpAddress();
    const port = process.env.PORT || 4000;
    const allInterfaces = getAllNetworkInterfaces();

    return res.json({
      localIp,
      port: Number(port),
      baseUrl: `http://${localIp}:${port}`,
      allInterfaces,
    });
  });

  // GET /api/devices - List all registered devices
  router.get('/devices', async (req: Request, res: Response) => {
    try {
      const devRes = await query('SELECT * FROM devices ORDER BY created_at DESC');
      return res.json({ devices: devRes.rows });
    } catch (error: any) {
      console.error('Error fetching devices:', error);
      return res.status(500).json({ error: 'Failed to retrieve devices' });
    }
  });

  // POST /api/devices - Register new device
  router.post('/devices', async (req: Request, res: Response) => {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Device name is required' });
    }

    try {
      // Generate Device ID (e.g. ESP32-A7F92)
      const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
      const deviceId = `ESP32-${randomHex}`;

      // Generate random secure token
      const deviceToken = crypto.randomBytes(16).toString('hex');

      const result = await query(
        'INSERT INTO devices (id, name, token, status) VALUES ($1, $2, $3, $4) RETURNING *',
        [deviceId, name.trim(), deviceToken, 'OFFLINE']
      );

      const device = result.rows[0];

      // Log creation event
      await query(
        'INSERT INTO device_events (device_id, event_type, message) VALUES ($1, $2, $3)',
        [deviceId, 'DEVICE_REGISTERED', `Device "${name}" registered with ID ${deviceId}`]
      );

      io.emit('device_created', device);

      return res.status(201).json({
        device,
        serverIp: getLocalIpAddress(),
        serverPort: Number(process.env.PORT || 4000),
      });
    } catch (error: any) {
      console.error('Error creating device:', error);
      return res.status(500).json({ error: 'Failed to create device' });
    }
  });

  // GET /api/devices/:id - Single device details with telemetry, components & rules
  router.get('/devices/:id', async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const devRes = await query('SELECT * FROM devices WHERE id = $1', [id]);
      if (devRes.rows.length === 0) {
        return res.status(404).json({ error: 'Device not found' });
      }

      const device = devRes.rows[0];

      const compsRes = await query('SELECT * FROM components WHERE device_id = $1 ORDER BY gpio_pin ASC', [id]);
      const rulesRes = await query('SELECT * FROM automation_rules WHERE device_id = $1 ORDER BY created_at DESC', [id]);
      const readingsRes = await query('SELECT * FROM sensor_readings WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 50', [id]);
      const cmdsRes = await query('SELECT * FROM device_commands WHERE device_id = $1 ORDER BY created_at DESC LIMIT 20', [id]);
      const eventsRes = await query('SELECT * FROM device_events WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 20', [id]);

      return res.json({
        device,
        components: compsRes.rows,
        rules: rulesRes.rows,
        readings: readingsRes.rows,
        commands: cmdsRes.rows,
        events: eventsRes.rows,
        serverIp: getLocalIpAddress(),
        serverPort: Number(process.env.PORT || 4000),
      });
    } catch (error: any) {
      console.error('Error fetching device detail:', error);
      return res.status(500).json({ error: 'Failed to load device details' });
    }
  });

  // DELETE /api/devices/:id - Delete device
  router.delete('/devices/:id', async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      await query('DELETE FROM devices WHERE id = $1', [id]);
      io.emit('device_deleted', { deviceId: id });
      return res.json({ success: true, message: `Device ${id} deleted successfully` });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete device' });
    }
  });

  // POST /api/devices/:id/hardware - Save & validate component GPIO pin mappings
  router.post('/devices/:id/hardware', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { components } = req.body; // Array of { name, type, gpio_pin, gpio_secondary, category }

    if (!Array.isArray(components)) {
      return res.status(400).json({ error: 'Components payload must be an array' });
    }

    // Validation rules
    const usedPins = new Set<number>();
    const validGpios = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39];

    for (const comp of components) {
      const pin = Number(comp.gpio_pin);
      if (isNaN(pin)) {
        return res.status(400).json({ error: `Invalid GPIO pin number for ${comp.name}` });
      }

      if (!validGpios.includes(pin)) {
        return res.status(400).json({ error: `GPIO ${pin} is not a valid programmable pin on ESP32` });
      }

      if (usedPins.has(pin)) {
        return res.status(400).json({ error: `Duplicate assignment: GPIO ${pin} is assigned to multiple components` });
      }
      usedPins.add(pin);

      if (comp.gpio_secondary !== undefined && comp.gpio_secondary !== null) {
        const secPin = Number(comp.gpio_secondary);
        if (!isNaN(secPin) && secPin !== -1 && secPin >= 0) {
          if (usedPins.has(secPin)) {
            return res.status(400).json({ error: `Duplicate assignment: Secondary GPIO ${secPin} is already in use` });
          }
          usedPins.add(secPin);
        }
      }
    }

    try {
      // Clear existing components for this device
      await query('DELETE FROM components WHERE device_id = $1', [id]);

      // Insert new components
      for (const comp of components) {
        const secPin = (comp.gpio_secondary !== undefined && comp.gpio_secondary !== null && !isNaN(Number(comp.gpio_secondary))) ? Number(comp.gpio_secondary) : -1;
        await query(
          'INSERT INTO components (device_id, name, type, gpio_pin, gpio_secondary, category) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, comp.name, comp.type, comp.gpio_pin, secPin, comp.category || 'INPUT']
        );
      }

      await query(
        'INSERT INTO device_events (device_id, event_type, message) VALUES ($1, $2, $3)',
        [id, 'HARDWARE_CONFIG_CHANGE', `Updated hardware configuration (${components.length} components)`]
      );

      io.to(id).emit('hardware_config_updated', { deviceId: id, components });

      return res.json({ success: true, message: 'Hardware configuration saved successfully' });
    } catch (error: any) {
      console.error('Error saving hardware config:', error);
      return res.status(500).json({ error: 'Failed to update hardware configuration' });
    }
  });

  // GET & POST /api/devices/:id/automations - Rule management
  router.get('/devices/:id/automations', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const rulesRes = await query('SELECT * FROM automation_rules WHERE device_id = $1 ORDER BY created_at DESC', [id]);
      return res.json({ rules: rulesRes.rows });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to retrieve automation rules' });
    }
  });

  router.post('/devices/:id/automations', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, sensor_component, condition, trigger_value, action_component, action_type, action_value } = req.body;

    if (!sensor_component || !action_component) {
      return res.status(400).json({ error: 'Sensor component and Action component are required' });
    }

    try {
      const ruleName = name || `Rule: ${action_component} when ${sensor_component} ${condition || 'triggers'}`;

      const resRule = await query(
        'INSERT INTO automation_rules (device_id, name, sensor_component, condition, trigger_value, action_component, action_type, action_value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [id, ruleName, sensor_component, condition || 'DETECTED', trigger_value || 0, action_component, action_type || 'GPIO_WRITE', action_value ?? 1]
      );

      const rule = resRule.rows[0];

      await query(
        'INSERT INTO device_events (device_id, event_type, message) VALUES ($1, $2, $3)',
        [id, 'RULE_CREATED', `Created automation rule "${ruleName}"`]
      );

      io.to(id).emit('rule_created', rule);

      return res.status(201).json({ success: true, rule });
    } catch (error: any) {
      console.error('Error creating automation rule:', error);
      return res.status(500).json({ error: 'Failed to save automation rule' });
    }
  });

  router.delete('/devices/:id/automations/:ruleId', async (req: Request, res: Response) => {
    const { id, ruleId } = req.params;
    try {
      await query('DELETE FROM automation_rules WHERE id = $1 AND device_id = $2', [ruleId, id]);
      io.to(id).emit('rule_deleted', { ruleId });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete automation rule' });
    }
  });

  // POST /api/devices/:id/commands - Manual actuation from Dashboard
  router.post('/devices/:id/commands', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { command_type, gpio_pin, value } = req.body;

    if (gpio_pin === undefined || value === undefined) {
      return res.status(400).json({ error: 'gpio_pin and value are required' });
    }

    try {
      const resCmd = await query(
        'INSERT INTO device_commands (device_id, command_type, gpio_pin, value, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, command_type || 'GPIO_WRITE', Number(gpio_pin), Number(value), 'PENDING']
      );

      const cmd = resCmd.rows[0];

      await query(
        'INSERT INTO device_events (device_id, event_type, message) VALUES ($1, $2, $3)',
        [id, 'MANUAL_COMMAND_SENT', `Manual control: Set GPIO ${gpio_pin} to ${value}`]
      );

      io.to(id).emit('command_created', cmd);

      return res.status(201).json({ success: true, command: cmd });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to queue command' });
    }
  });

  // POST /api/copilot/parse - AI Copilot deterministic rule parser
  router.post('/copilot/parse', async (req: Request, res: Response) => {
    const { prompt, deviceId } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Natural language prompt is required' });
    }

    try {
      let components: any[] = [];
      if (deviceId) {
        const compRes = await query('SELECT type, gpio_pin FROM components WHERE device_id = $1', [deviceId]);
        components = compRes.rows;
      }

      const copilotResult = await aiCopilotService.parsePrompt(prompt, components);
      return res.json(copilotResult);
    } catch (error: any) {
      return res.status(500).json({ error: 'AI Copilot processing failed' });
    }
  });

  return router;
}

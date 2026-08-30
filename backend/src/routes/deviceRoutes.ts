import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../db';
import { getLocalIpAddress, getAllNetworkInterfaces } from '../config/network';
import { aiCopilotService } from '../services/aiCopilot';
import { Server as SocketIOServer } from 'socket.io';
import { getMqttBroker } from '../services/mqttBroker';

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

  // POST /api/devices/:id/commands & /api/device/:id/commands - Manual actuation from Dashboard
  const handlePostCommand = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { command_type, gpio_pin, value } = req.body;

    if (gpio_pin === undefined || value === undefined) {
      return res.status(400).json({ error: 'gpio_pin and value are required' });
    }

    try {
      // Ensure target device exists in database
      const devCheck = await query('SELECT id FROM devices WHERE id = $1', [id]);
      if (devCheck.rows.length === 0) {
        const defaultToken = 'TOKEN_' + Math.random().toString(36).substring(2, 10).toUpperCase();
        await query(
          'INSERT INTO devices (id, name, token, status, ip_address) VALUES ($1, $2, $3, $4, $5)',
          [id, `ESP32 Node (${id})`, defaultToken, 'ONLINE', '127.0.0.1']
        );
      }

      const resCmd = await query(
        'INSERT INTO device_commands (device_id, command_type, gpio_pin, value, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, command_type || 'GPIO_WRITE', Number(gpio_pin), Number(value), 'PENDING']
      );

      const cmd = resCmd.rows[0];

      await query(
        'INSERT INTO device_events (device_id, event_type, message) VALUES ($1, $2, $3)',
        [id, 'MANUAL_COMMAND_SENT', `Manual control: Set GPIO ${gpio_pin} to ${value}`]
      );

      // Instantly push command over MQTT if active broker available
      const broker = getMqttBroker();
      if (broker) {
        broker.publishCommand(id, Number(gpio_pin), Number(value), cmd.id);
      }

      io.emit('command_created', cmd);
      io.to(id).emit('command_created', cmd);

      return res.status(201).json({ success: true, command: cmd });
    } catch (error: any) {
      console.error('Error queuing command:', error);
      return res.status(500).json({ error: 'Failed to queue command' });
    }
  };

  router.post('/devices/:id/commands', handlePostCommand);
  router.post('/device/:id/commands', handlePostCommand);

  // GLOBAL AUTOMATION ROUTES
  // GET /api/automations - Retrieve all automation rules across all devices
  router.get('/automations', async (req: Request, res: Response) => {
    try {
      const rulesRes = await query('SELECT * FROM automation_rules ORDER BY created_at DESC');
      const devRes = await query('SELECT id, name FROM devices');
      
      const deviceMap = new Map<string, string>();
      devRes.rows.forEach((d: any) => deviceMap.set(d.id, d.name));

      const rulesWithDeviceName = rulesRes.rows.map((r: any) => ({
        ...r,
        device_name: deviceMap.get(r.device_id) || r.device_id,
      }));

      return res.json({ rules: rulesWithDeviceName });
    } catch (error: any) {
      console.error('Error fetching global automations:', error);
      return res.status(500).json({ error: 'Failed to retrieve automation rules' });
    }
  });

  // PATCH /api/automations/:ruleId/toggle - Toggle rule active status
  router.patch('/automations/:ruleId/toggle', async (req: Request, res: Response) => {
    const { ruleId } = req.params;
    const { is_active } = req.body;

    try {
      const result = await query(
        'UPDATE automation_rules SET is_active = $1 WHERE id = $2 RETURNING *',
        [Boolean(is_active), ruleId]
      );
      
      io.emit('rule_updated', { ruleId, is_active });
      return res.json({ success: true, rule: result.rows[0] });
    } catch (error: any) {
      console.error('Error toggling rule:', error);
      return res.status(500).json({ error: 'Failed to toggle automation rule' });
    }
  });

  // DELETE /api/automations/:ruleId - Delete rule globally
  router.delete('/automations/:ruleId', async (req: Request, res: Response) => {
    const { ruleId } = req.params;

    try {
      await query('DELETE FROM automation_rules WHERE id = $1', [ruleId]);
      io.emit('rule_deleted', { ruleId });
      return res.json({ success: true, message: 'Rule deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting rule:', error);
      return res.status(500).json({ error: 'Failed to delete automation rule' });
    }
  });

  // GLOBAL TELEMETRY ROUTES
  // GET /api/telemetry - Retrieve telemetry readings across devices
  router.get('/telemetry', async (req: Request, res: Response) => {
    const { deviceId, limit } = req.query;
    const queryLimit = limit ? Math.min(Number(limit), 200) : 100;

    try {
      let readingsRes;
      if (deviceId && typeof deviceId === 'string') {
        readingsRes = await query(
          'SELECT * FROM sensor_readings WHERE device_id = $1 ORDER BY timestamp DESC LIMIT $2',
          [deviceId, queryLimit]
        );
      } else {
        readingsRes = await query(
          'SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT $1',
          [queryLimit]
        );
      }

      const devRes = await query('SELECT id, name FROM devices');
      const deviceMap = new Map<string, string>();
      devRes.rows.forEach((d: any) => deviceMap.set(d.id, d.name));

      const readingsWithDevName = readingsRes.rows.map((r: any) => ({
        ...r,
        device_name: deviceMap.get(r.device_id) || r.device_id,
      }));

      return res.json({ readings: readingsWithDevName });
    } catch (error: any) {
      console.error('Error fetching global telemetry:', error);
      return res.status(500).json({ error: 'Failed to retrieve telemetry data' });
    }
  });

  // GET /api/telemetry/stats - Aggregate telemetry statistics
  router.get('/telemetry/stats', async (req: Request, res: Response) => {
    try {
      const readingsRes = await query('SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT 500');
      const readings = readingsRes.rows;

      const readingTypesSet = new Set<string>();
      const deviceIdsSet = new Set<string>();
      let totalValue = 0;
      let maxValue = -Infinity;
      let minValue = Infinity;

      readings.forEach((r: any) => {
        if (r.reading_type) readingTypesSet.add(r.reading_type.toLowerCase());
        if (r.device_id) deviceIdsSet.add(r.device_id);
        const val = Number(r.value);
        if (!isNaN(val)) {
          totalValue += val;
          if (val > maxValue) maxValue = val;
          if (val < minValue) minValue = val;
        }
      });

      const count = readings.length;
      const stats = {
        totalReadings: count,
        activeDevicesCount: deviceIdsSet.size,
        sensorTypes: Array.from(readingTypesSet),
        averageValue: count > 0 ? parseFloat((totalValue / count).toFixed(2)) : 0,
        maxValue: count > 0 && maxValue !== -Infinity ? maxValue : 0,
        minValue: count > 0 && minValue !== Infinity ? minValue : 0,
      };

      return res.json(stats);
    } catch (error: any) {
      console.error('Error calculating telemetry stats:', error);
      return res.status(500).json({ error: 'Failed to calculate telemetry stats' });
    }
  });

  // GET /api/devices/:id/firmware/main-loop - Get updated C++ ESP32 main loop with active automation rules
  router.get('/devices/:id/firmware/main-loop', async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const rulesRes = await query('SELECT * FROM automation_rules WHERE device_id = $1 AND is_active = true', [id]);
      const mainLoopCode = aiCopilotService.generateMainLoopCode(rulesRes.rows);
      return res.json({ success: true, mainLoopCode, rulesCount: rulesRes.rows.length });
    } catch (error: any) {
      console.error('Error generating main loop code:', error);
      return res.status(500).json({ error: 'Failed to generate firmware code' });
    }
  });

  // POST /api/copilot/parse - AI Copilot rule parser powered by Reka AI with auto-apply
  router.post('/copilot/parse', async (req: Request, res: Response) => {
    const { prompt, deviceId, autoApply } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Natural language prompt is required' });
    }

    try {
      let components: any[] = [];
      let targetDeviceId = deviceId;

      if (!targetDeviceId) {
        const firstDev = await query('SELECT id FROM devices LIMIT 1');
        if (firstDev.rows.length > 0) {
          targetDeviceId = firstDev.rows[0].id;
        }
      }

      if (targetDeviceId) {
        const compRes = await query('SELECT type, gpio_pin, name FROM components WHERE device_id = $1', [targetDeviceId]);
        components = compRes.rows;
      }

      const copilotResult = await aiCopilotService.parsePrompt(prompt, components);

      let appliedRule = null;
      if (autoApply && copilotResult.success && copilotResult.rule && targetDeviceId) {
        const r = copilotResult.rule;
        const resRule = await query(
          'INSERT INTO automation_rules (device_id, name, sensor_component, condition, trigger_value, action_component, action_type, action_value, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING *',
          [targetDeviceId, r.name, r.sensor_component, r.condition, r.trigger_value, r.action_component, r.action_type, r.action_value]
        );
        appliedRule = resRule.rows[0];

        await query(
          'INSERT INTO device_events (device_id, event_type, message) VALUES ($1, $2, $3)',
          [targetDeviceId, 'RULE_CREATED', `[Reka AI] Auto-applied rule: "${r.name}"`]
        );

        io.emit('rule_created', appliedRule);
        io.to(targetDeviceId).emit('rule_created', appliedRule);
      }

      // Fetch all active rules to generate the updated main ESP32 C++ loop code
      let allRules: any[] = [];
      if (targetDeviceId) {
        const allRulesRes = await query('SELECT * FROM automation_rules WHERE device_id = $1 AND is_active = true', [targetDeviceId]);
        allRules = allRulesRes.rows;
      } else {
        allRules = copilotResult.rule ? [copilotResult.rule] : [];
      }

      const updatedMainCode = aiCopilotService.generateMainLoopCode(allRules);

      return res.json({
        ...copilotResult,
        appliedRule,
        updated_main_code: updatedMainCode,
        deviceId: targetDeviceId,
      });
    } catch (error: any) {
      console.error('AI Copilot processing error:', error);
      return res.status(500).json({ error: 'AI Copilot processing failed', details: error.message });
    }
  });

  return router;
}

import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db';
import { evaluateAutomationRules } from '../services/automationEngine';
import { Server as SocketIOServer } from 'socket.io';

export function createEsp32Router(io: SocketIOServer): Router {
  const router = Router();

  // Authentication Middleware for ESP32 Endpoints
  const authenticateDevice = async (req: Request, res: Response, next: NextFunction) => {
    const deviceId = req.params.deviceId;
    const token = (req.headers['x-device-token'] as string) || (req.query.token as string) || req.body?.token;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    try {
      const devRes = await query('SELECT * FROM devices WHERE id = $1', [deviceId]);
      if (devRes.rows.length === 0) {
        return res.status(404).json({ error: 'Device not found' });
      }

      const device = devRes.rows[0];
      if (token && device.token !== token) {
        return res.status(401).json({ error: 'Invalid device token' });
      }

      // Attach client IP address and device object
      const clientIp = req.ip || req.socket.remoteAddress || '';
      (req as any).device = device;
      (req as any).clientIp = clientIp.replace('::ffff:', '');

      next();
    } catch (err) {
      console.error('Device auth error:', err);
      return res.status(500).json({ error: 'Internal database authentication failure' });
    }
  };

  // 1. GET /api/device/:deviceId/config - Download Hardware Configuration
  router.get('/:deviceId/config', authenticateDevice, async (req: Request, res: Response) => {
    const deviceId = req.params.deviceId;

    try {
      const compRes = await query('SELECT * FROM components WHERE device_id = $1 ORDER BY gpio_pin ASC', [deviceId]);
      
      const components = compRes.rows.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        gpio: c.gpio_pin,
        gpio_secondary: c.gpio_secondary,
        category: c.category,
      }));

      return res.json({
        device_id: deviceId,
        device_name: (req as any).device.name,
        components,
      });
    } catch (error: any) {
      console.error('Error fetching hardware config:', error);
      return res.status(500).json({ error: 'Failed to retrieve hardware configuration' });
    }
  });

  // 2. POST /api/device/:deviceId/data - Receive Telemetry from ESP32
  router.get('/:deviceId/data', authenticateDevice, async (req: Request, res: Response) => {
    // Convenience handler if GET requested
    return res.status(405).json({ error: 'Use POST to submit telemetry data' });
  });

  router.post('/:deviceId/data', authenticateDevice, async (req: Request, res: Response) => {
    const deviceId = req.params.deviceId;
    const readings = req.body;
    const clientIp = (req as any).clientIp;

    if (!readings || typeof readings !== 'object') {
      return res.status(400).json({ error: 'Invalid readings payload' });
    }

    try {
      // Mark device ONLINE and record IP address
      await query(
        'UPDATE devices SET status = $1, ip_address = $2, last_seen = NOW() WHERE id = $3',
        ['ONLINE', clientIp, deviceId]
      );

      const timestamp = new Date();

      // Save each telemetry reading into sensor_readings table
      for (const [key, value] of Object.entries(readings)) {
        if (key === 'token' || key === 'deviceId') continue;

        let compType = key.toUpperCase();
        let readingType = key.toLowerCase();
        let numericValue = 0;

        if (typeof value === 'boolean') {
          numericValue = value ? 1 : 0;
        } else if (typeof value === 'number') {
          numericValue = value;
        } else if (typeof value === 'string') {
          numericValue = parseFloat(value) || 0;
        }

        await query(
          'INSERT INTO sensor_readings (device_id, component_type, reading_type, value, raw_data, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
          [deviceId, compType, readingType, numericValue, JSON.stringify({ [key]: value }), timestamp]
        );
      }

      // Run Automation Engine rules against incoming telemetry
      const triggeredCount = await evaluateAutomationRules(deviceId, readings, io);

      // Broadcast real-time telemetry update to all connected WebSockets
      const telemetryPayload = { deviceId, readings, timestamp, triggeredCount };
      io.emit('device_telemetry', telemetryPayload);
      io.to(deviceId).emit('device_telemetry', telemetryPayload);

      return res.json({
        success: true,
        deviceId,
        processedCount: Object.keys(readings).length,
        automationsTriggered: triggeredCount,
        timestamp: timestamp.toISOString(),
      });
    } catch (error: any) {
      console.error('Error processing sensor telemetry:', error);
      return res.status(500).json({ error: 'Failed to record telemetry data' });
    }
  });

  // 3. POST /api/device/:deviceId/heartbeat - Ping Device Online Status
  router.post('/:deviceId/heartbeat', authenticateDevice, async (req: Request, res: Response) => {
    const deviceId = req.params.deviceId;
    const clientIp = (req as any).clientIp;

    try {
      await query(
        'UPDATE devices SET status = $1, ip_address = $2, last_seen = NOW() WHERE id = $3',
        ['ONLINE', clientIp, deviceId]
      );

      const heartbeatPayload = {
        deviceId,
        status: 'ONLINE',
        ipAddress: clientIp,
        timestamp: new Date(),
      };

      io.emit('device_heartbeat', heartbeatPayload);
      io.to(deviceId).emit('device_heartbeat', heartbeatPayload);

      return res.json({
        status: 'ONLINE',
        acknowledged: true,
        serverTime: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Heartbeat processing failed' });
    }
  });

  // 4. GET /api/device/:deviceId/commands - ESP32 Poll Pending Output Commands
  router.get('/:deviceId/commands', authenticateDevice, async (req: Request, res: Response) => {
    const deviceId = req.params.deviceId;

    try {
      // Query pending commands
      const cmdRes = await query(
        "SELECT * FROM device_commands WHERE device_id = $1 AND status = 'PENDING' ORDER BY created_at ASC",
        [deviceId]
      );

      const pendingCommands = cmdRes.rows.map(c => ({
        id: c.id,
        type: c.command_type,
        gpio: c.gpio_pin,
        value: c.value,
      }));

      // Mark queried commands as 'SENT'
      for (const cmd of cmdRes.rows) {
        await query("UPDATE device_commands SET status = $1 WHERE id = $2", ['SENT', cmd.id]);
      }

      return res.json({
        deviceId,
        count: pendingCommands.length,
        commands: pendingCommands,
      });
    } catch (error: any) {
      console.error('Error serving commands to ESP32:', error);
      return res.status(500).json({ error: 'Failed to retrieve pending commands' });
    }
  });

  // 5. POST /api/device/:deviceId/commands/:commandId/ack - ESP32 Acknowledge Command Execution
  router.post('/:deviceId/commands/:commandId/ack', authenticateDevice, async (req: Request, res: Response) => {
    const { deviceId, commandId } = req.params;

    try {
      const updateRes = await query(
        "UPDATE device_commands SET status = $1, executed_at = NOW() WHERE id = $2 AND device_id = $3 RETURNING *",
        ['EXECUTED', commandId, deviceId]
      );

      if (updateRes.rows.length === 0) {
        return res.status(404).json({ error: 'Command not found or already acknowledged' });
      }

      const executedCmd = updateRes.rows[0];

      // Log event
      await query(
        'INSERT INTO device_events (device_id, event_type, message, details) VALUES ($1, $2, $3, $4)',
        [deviceId, 'COMMAND_EXECUTED', `Device executed command #${commandId} (GPIO ${executedCmd.gpio_pin} -> ${executedCmd.value})`, JSON.stringify(executedCmd)]
      );

      io.to(deviceId).emit('command_executed', executedCmd);

      return res.json({
        success: true,
        commandId: executedCmd.id,
        status: 'EXECUTED',
      });
    } catch (error: any) {
      console.error('Error confirming command execution:', error);
      return res.status(500).json({ error: 'Command acknowledgment failed' });
    }
  });

  return router;
}

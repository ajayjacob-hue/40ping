import { query } from '../db';
import { Server as SocketIOServer } from 'socket.io';
import { getMqttBroker } from './mqttBroker';

export interface SensorReadingsMap {
  [key: string]: number | boolean;
}

export async function evaluateAutomationRules(
  deviceId: string,
  readings: SensorReadingsMap,
  io?: SocketIOServer
): Promise<number> {
  let commandsTriggered = 0;

  try {
    // 1. Fetch active automation rules for this device
    const rulesRes = await query(
      'SELECT * FROM automation_rules WHERE device_id = $1 AND is_active = true',
      [deviceId]
    );

    if (rulesRes.rows.length === 0) return 0;

    // 2. Fetch device components to map action_component to physical gpio_pin
    const compsRes = await query(
      'SELECT * FROM components WHERE device_id = $1',
      [deviceId]
    );
    const components = compsRes.rows;

    for (const rule of rulesRes.rows) {
      let triggered = false;
      const sensorComp = rule.sensor_component.toUpperCase();
      const condition = rule.condition.toUpperCase();
      const triggerVal = Number(rule.trigger_value);

      // Check relevant readings keys depending on sensor component type
      let currentValue: number | undefined;

      if (sensorComp === 'DHT11' || sensorComp.includes('TEMP') || sensorComp.includes('HUMIDITY')) {
        if ('temperature' in readings && (sensorComp.includes('TEMP') || sensorComp === 'DHT11')) {
          currentValue = Number(readings.temperature);
        } else if ('humidity' in readings && sensorComp.includes('HUMIDITY')) {
          currentValue = Number(readings.humidity);
        }
      } else if (sensorComp === 'PIR' || sensorComp.includes('MOTION')) {
        if ('motion' in readings) {
          currentValue = typeof readings.motion === 'boolean' ? (readings.motion ? 1 : 0) : Number(readings.motion);
        }
      } else if (sensorComp === 'LDR' || sensorComp.includes('LIGHT')) {
        if ('light' in readings) {
          currentValue = Number(readings.light);
        }
      } else if (sensorComp === 'HC-SR04' || sensorComp.includes('DISTANCE')) {
        if ('distance' in readings) {
          currentValue = Number(readings.distance);
        }
      } else if (sensorComp === 'PUSH_BUTTON' || sensorComp.includes('BUTTON')) {
        if ('button' in readings) {
          currentValue = typeof readings.button === 'boolean' ? (readings.button ? 1 : 0) : Number(readings.button);
        }
      } else {
        // Generic fallback check key by lowercase sensor name
        const key = sensorComp.toLowerCase();
        if (key in readings) {
          currentValue = Number(readings[key]);
        }
      }

      if (currentValue === undefined) continue;

      // Evaluate condition
      switch (condition) {
        case 'DETECTED':
        case 'EQUALS':
          if (currentValue === triggerVal || (condition === 'DETECTED' && currentValue > 0)) {
            triggered = true;
          }
          break;
        case 'GREATER_THAN':
          if (currentValue > triggerVal) {
            triggered = true;
          }
          break;
        case 'LESS_THAN':
          if (currentValue < triggerVal) {
            triggered = true;
          }
          break;
      }

      if (triggered) {
        // Find target action component
        const targetComp = components.find(
          c => c.type.toUpperCase() === rule.action_component.toUpperCase() ||
               c.name.toUpperCase() === rule.action_component.toUpperCase()
        );

        const gpioPin = targetComp ? targetComp.gpio_pin : 18; // Default fallback to GPIO 18 (LED)

        // Check last command state for this GPIO pin to avoid redundant spam commands causing flashing loops
        const lastCmdRes = await query(
          "SELECT value FROM device_commands WHERE device_id = $1 AND gpio_pin = $2 ORDER BY created_at DESC LIMIT 1",
          [deviceId, gpioPin]
        );

        const lastValue = lastCmdRes.rows.length > 0 ? Number(lastCmdRes.rows[0].value) : -1;

        if (lastValue !== Number(rule.action_value)) {
          const pendingCheck = await query(
            "SELECT * FROM device_commands WHERE device_id = $1 AND gpio_pin = $2 AND status = 'PENDING'",
            [deviceId, gpioPin]
          );

          if (pendingCheck.rows.length === 0) {
            const insertCmd = await query(
              'INSERT INTO device_commands (device_id, command_type, gpio_pin, value, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
              [deviceId, rule.action_type, gpioPin, rule.action_value, 'PENDING']
            );

            commandsTriggered++;

            const cmd = insertCmd.rows[0];

            // Instantly push automation command over MQTT
            const broker = getMqttBroker();
            if (broker) {
              broker.publishCommand(deviceId, gpioPin, Number(rule.action_value), cmd.id);
            }

            // Log event
            const eventMsg = `⚡ Automation rule "${rule.name}" triggered: Set ${rule.action_component} (GPIO ${gpioPin}) to ${rule.action_value}`;
            await query(
              'INSERT INTO device_events (device_id, event_type, message, details) VALUES ($1, $2, $3, $4)',
              [deviceId, 'AUTOMATION_TRIGGERED', eventMsg, JSON.stringify({ ruleId: rule.id, readings })]
            );

            // Broadcast real-time Socket.IO alert
            if (io) {
              io.to(deviceId).emit('automation_triggered', {
                rule,
                command: cmd,
                message: eventMsg,
              });
              io.to(deviceId).emit('command_created', cmd);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Automation Engine Error:', error);
  }

  return commandsTriggered;
}

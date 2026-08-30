import net from 'net';
import { query } from '../db';
import { evaluateAutomationRules } from './automationEngine';
import { Server as SocketIOServer } from 'socket.io';

const aedesModule = require('aedes');

export interface MqttBrokerInstance {
  aedes: any;
  tcpServer: net.Server;
  publishCommand: (deviceId: string, gpioPin: number, value: number, commandId?: number) => void;
}

let activeBrokerInstance: MqttBrokerInstance | null = null;

export function initMqttBroker(io: SocketIOServer, port: number = 1883): MqttBrokerInstance {
  const AedesClass = aedesModule.Aedes || aedesModule.default || aedesModule;
  const aedes = new AedesClass();
  const tcpServer = net.createServer(aedes.handle);

  tcpServer.listen(port, () => {
    console.log(`⚡ Embedded Aedes MQTT Broker listening on TCP port ${port}`);
  });

  // Client Connected
  aedes.on('client', (client: any) => {
    console.log(`🔌 MQTT Client Connected: ${client ? client.id : 'unknown'}`);
  });

  // Client Disconnected
  aedes.on('clientDisconnect', async (client: any) => {
    console.log(`❌ MQTT Client Disconnected: ${client ? client.id : 'unknown'}`);
    if (client && client.id && client.id.startsWith('ESP32-')) {
      try {
        await query('UPDATE devices SET status = $1 WHERE id = $2', ['OFFLINE', client.id]);
        io.emit('device_heartbeat', {
          deviceId: client.id,
          status: 'OFFLINE',
          timestamp: new Date(),
        });
      } catch (err) {
        console.error('Error updating MQTT LWT offline status:', err);
      }
    }
  });

  // Subscribe / Publish Topic Handler
  aedes.on('publish', async (packet: any, client: any) => {
    if (!packet || !packet.topic || packet.topic.startsWith('$SYS/')) return;

    const topicParts = packet.topic.split('/');
    if (topicParts[0] === 'devices' && topicParts.length >= 3) {
      const deviceId = topicParts[1];
      const action = topicParts[2];
      const payloadStr = packet.payload ? packet.payload.toString('utf8') : '';

      // 1. Telemetry Data
      if (action === 'telemetry' || action === 'data') {
        try {
          const readings = JSON.parse(payloadStr);
          const timestamp = new Date();

          // Mark device ONLINE
          await query(
            'UPDATE devices SET status = $1, last_seen = NOW() WHERE id = $2',
            ['ONLINE', deviceId]
          );

          // Save readings
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

          // Evaluate Automation Rules
          const triggeredCount = await evaluateAutomationRules(deviceId, readings, io);

          // Emit to Web Frontend via Socket.IO
          const telemetryPayload = { deviceId, readings, timestamp, triggeredCount };
          io.emit('device_telemetry', telemetryPayload);
          io.to(deviceId).emit('device_telemetry', telemetryPayload);

        } catch (err) {
          console.error(`Error parsing MQTT telemetry payload from ${deviceId}:`, err);
        }
      }

      // 2. Status / LWT
      else if (action === 'status') {
        const statusVal = payloadStr.toUpperCase() === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
        try {
          await query('UPDATE devices SET status = $1, last_seen = NOW() WHERE id = $2', [statusVal, deviceId]);
          io.emit('device_heartbeat', {
            deviceId,
            status: statusVal,
            timestamp: new Date(),
          });
        } catch (err) {
          console.error('Error handling MQTT device status:', err);
        }
      }

      // 3. Command Acknowledgement
      else if (action === 'ack') {
        try {
          const ackData = JSON.parse(payloadStr);
          const commandId = ackData.commandId || ackData.id;
          if (commandId) {
            await query(
              "UPDATE device_commands SET status = 'EXECUTED', executed_at = NOW() WHERE id = $1 AND device_id = $2",
              [commandId, deviceId]
            );
            io.to(deviceId).emit('command_executed', { commandId, deviceId });
          }
        } catch (err) {
          console.error('Error handling MQTT command ack:', err);
        }
      }
    }
  });

  const publishCommand = (deviceId: string, gpioPin: number, value: number, commandId?: number) => {
    const topic = `devices/${deviceId}/commands`;
    const payload = JSON.stringify({
      id: commandId || Date.now(),
      gpio: gpioPin,
      value: value,
    });

    aedes.publish(
      {
        cmd: 'publish',
        qos: 1,
        topic: topic,
        payload: Buffer.from(payload),
        retain: false,
        dup: false,
      },
      (err: any) => {
        if (err) {
          console.error(`Error publishing MQTT command to ${topic}:`, err);
        } else {
          console.log(`⚡ MQTT Command Published to ${topic}: GPIO ${gpioPin} -> ${value}`);
        }
      }
    );
  };

  const instance: MqttBrokerInstance = {
    aedes,
    tcpServer,
    publishCommand,
  };

  activeBrokerInstance = instance;
  return instance;
}

export function getMqttBroker(): MqttBrokerInstance | null {
  return activeBrokerInstance;
}

import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './db';
import { getLocalIpAddress } from './config/network';
import { createEsp32Router } from './routes/esp32Api';
import { createDeviceManagementRouter } from './routes/deviceRoutes';
import { initMqttBroker } from './services/mqttBroker';

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;
const MQTT_PORT = Number(process.env.MQTT_PORT) || 1883;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);

// CORS configuration for local network access
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Token', 'x-device-token'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static firmware binaries for WebSerial Flasher
const firmwareDir = path.join(__dirname, '../public/firmware');
app.use('/firmware', express.static(firmwareDir));

app.get('/api/firmware/universal.bin', (req, res) => {
  const binaryPath = path.join(firmwareDir, 'universal_esp32.bin');
  if (fs.existsSync(binaryPath)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="universal_esp32.bin"');
    res.sendFile(binaryPath);
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(Buffer.alloc(4096, 0xff));
  }
});

// Socket.IO Server Initialization
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`🔌 Dashboard / Client connected to Socket.IO: [${socket.id}]`);

  socket.on('join_device', (deviceId: string) => {
    if (deviceId) {
      socket.join(deviceId);
      console.log(`📡 Socket [${socket.id}] joined room device: ${deviceId}`);
    }
  });

  socket.on('leave_device', (deviceId: string) => {
    if (deviceId) {
      socket.leave(deviceId);
      console.log(`📡 Socket [${socket.id}] left room device: ${deviceId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected from Socket.IO: [${socket.id}]`);
  });
});

// Mount Routes
const esp32Router = createEsp32Router(io);
const deviceMgmtRouter = createDeviceManagementRouter(io);

app.use('/api/device', esp32Router);
app.use('/api/devices', esp32Router);
app.use('/api', deviceMgmtRouter);

// Base Health & Info Endpoint
app.get('/', (req, res) => {
  const localIp = getLocalIpAddress();
  res.json({
    status: 'ONLINE',
    system: 'IoT-to-Web Local Server for ESP32',
    serverIp: localIp,
    port: PORT,
    mqttPort: MQTT_PORT,
    esp32ConfigEndpoint: `http://${localIp}:${PORT}/api/device/:deviceId/config`,
    esp32DataEndpoint: `http://${localIp}:${PORT}/api/device/:deviceId/data`,
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start Server
async function startServer() {
  await initDb();
  initMqttBroker(io, MQTT_PORT);

  server.listen(PORT, HOST, () => {
    const localIp = getLocalIpAddress();
    console.log('\n==================================================');
    console.log('🚀  IoT-to-Web LOCAL SERVER IS RUNNING!');
    console.log('==================================================');
    console.log(`📡 Listening on All Interfaces: http://${HOST}:${PORT}`);
    console.log(`⚡ Embedded Aedes MQTT Broker:   mqtt://${localIp}:${MQTT_PORT}`);
    console.log(`🌐 LAPTOP LOCAL LAN IP ADDRESS:  http://${localIp}:${PORT}`);
    console.log('--------------------------------------------------');
    console.log(`⚡ Use this server IP in your ESP32 firmware:`);
    console.log(`   const char* SERVER_IP = "${localIp}";`);
    console.log(`   const int SERVER_PORT = ${PORT};`);
    console.log(`   const int MQTT_PORT   = ${MQTT_PORT};`);
    console.log('==================================================\n');
  });
}

startServer();

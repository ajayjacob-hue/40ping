import axios from 'axios';

const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:4000';
let DEVICE_ID = process.env.DEVICE_ID || 'ESP32-A7F92';
let DEVICE_TOKEN = process.env.DEVICE_TOKEN || '';

let simulatedLedState = false;
let simulatedBuzzerState = false;
let simulatedServoAngle = 0;

interface Component {
  id?: number;
  name: string;
  type: string;
  gpio: number;
  gpio_secondary?: number;
  category: string;
}

let installedComponents: Component[] = [];
let isPollingCommands = false;
let lastCommandErrorLogged = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateHardwareConfig() {
  try {
    const configRes = await axios.get(`${SERVER_URL}/api/device/${DEVICE_ID}/config`, {
      headers: { 'X-Device-Token': DEVICE_TOKEN },
      timeout: 3000,
    });
    installedComponents = configRes.data.components || [];
    console.log('📋 Installed Hardware Components:', JSON.stringify(installedComponents, null, 2));
  } catch (err: any) {
    console.error('Failed to download hardware config:', err.message);
  }
}

async function connectAndRegister(): Promise<boolean> {
  console.log(`📡 Connecting to Backend: ${SERVER_URL} ...`);

  try {
    // 1. Verify server info endpoint
    const serverInfoRes = await axios.get(`${SERVER_URL}/api/server-info`, { timeout: 3000 }).catch(() => null);
    if (serverInfoRes) {
      console.log(`🌐 Verified local server online at ${serverInfoRes.data.baseUrl || SERVER_URL}`);
    }

    // 2. Fetch registered devices
    const devicesRes = await axios.get(`${SERVER_URL}/api/devices`, { timeout: 3000 });
    const devices = devicesRes.data.devices || [];

    let targetDev = devices.find((d: any) => d.id === DEVICE_ID);

    if (!targetDev) {
      console.log(`⚙️ Creating new simulated device "Smart Room" (${DEVICE_ID})...`);
      const createRes = await axios.post(`${SERVER_URL}/api/devices`, { name: 'Smart Room (Simulated)' }, { timeout: 3000 });
      targetDev = createRes.data.device;
      DEVICE_ID = targetDev.id;
      DEVICE_TOKEN = targetDev.token;
      console.log(`✅ Registered Device! ID: ${DEVICE_ID} | Token: ${DEVICE_TOKEN}`);
    } else {
      DEVICE_TOKEN = targetDev.token;
      console.log(`✅ Paired with existing Device: ${DEVICE_ID}`);
    }

    // 3. Download hardware configuration
    console.log(`📥 Downloading hardware config from ${SERVER_URL}/api/device/${DEVICE_ID}/config ...`);
    await updateHardwareConfig();
    return true;
  } catch (error: any) {
    console.error(`⚠️ Connection failed (${error.message}). Retrying in 3 seconds...`);
    return false;
  }
}

async function pollCommands() {
  if (isPollingCommands) return;
  isPollingCommands = true;

  try {
    const cmdRes = await axios.get(`${SERVER_URL}/api/device/${DEVICE_ID}/commands`, {
      headers: { 'X-Device-Token': DEVICE_TOKEN },
      timeout: 3000,
    });

    lastCommandErrorLogged = false;
    const commands = cmdRes.data.commands || [];

    for (const cmd of commands) {
      console.log(`\n⚡ SIMULATOR EXECUTING COMMAND [#${cmd.id}]: ${cmd.type} on GPIO ${cmd.gpio} -> Value: ${cmd.value}`);

      // Match GPIO pin against remote hardware configuration or fallbacks
      const matchedComp = installedComponents.find((c) => Number(c.gpio) === Number(cmd.gpio));
      const compType = matchedComp ? matchedComp.type.toUpperCase() : '';

      if (compType === 'LED' || cmd.gpio === 18 || matchedComp?.category === 'OUTPUT') {
        simulatedLedState = cmd.value === 1;
      }
      if (compType === 'BUZZER' || cmd.gpio === 19) {
        simulatedBuzzerState = cmd.value === 1;
      }
      if (compType === 'SERVO' || cmd.gpio === 21) {
        simulatedServoAngle = cmd.value;
      }

      console.log(
        `   [Simulated Hardware State] LED: ${simulatedLedState ? '🟢 ON' : '🔴 OFF'} | Buzzer: ${
          simulatedBuzzerState ? '🔊 BEEPing' : '🔇 Mute'
        } | Servo: ${simulatedServoAngle}°`
      );

      // Send ACK
      await axios.post(
        `${SERVER_URL}/api/device/${DEVICE_ID}/commands/${cmd.id}/ack`,
        {},
        {
          headers: { 'X-Device-Token': DEVICE_TOKEN },
          timeout: 3000,
        }
      );
      console.log(`   ✅ Sent ACK for command #${cmd.id}`);
    }
  } catch (err: any) {
    if (!lastCommandErrorLogged) {
      console.error('Command poll error:', err.message);
      lastCommandErrorLogged = true;
    }
  } finally {
    isPollingCommands = false;
  }
}

let baseTemp = 24.0;
let baseHumidity = 55.0;
let stepCount = 0;

async function sendTelemetry() {
  stepCount++;
  // Simulate natural fluctuations
  const temperature = parseFloat((baseTemp + Math.sin(stepCount * 0.2) * 4.5).toFixed(1));
  const humidity = parseFloat((baseHumidity + Math.cos(stepCount * 0.2) * 5.0).toFixed(1));
  const motion = stepCount % 6 === 0; // Trigger motion every 12 seconds
  const light = Math.floor(300 + Math.random() * 200);
  const distance = parseFloat((15 + Math.random() * 40).toFixed(1));

  const payload = {
    temperature,
    humidity,
    motion,
    light,
    distance,
    led_state: simulatedLedState ? 1 : 0,
  };

  try {
    await axios.post(`${SERVER_URL}/api/device/${DEVICE_ID}/data`, payload, {
      headers: { 'X-Device-Token': DEVICE_TOKEN },
      timeout: 3000,
    });
    console.log(
      `📤 [${new Date().toLocaleTimeString()}] Telemetry Sent -> Temp: ${temperature}°C | Hum: ${humidity}% | Motion: ${
        motion ? '🏃 MOTION DETECTED' : '---'
      }`
    );
  } catch (err: any) {
    console.error('Telemetry post error:', err.message);
  }
}

async function sendHeartbeat() {
  try {
    await axios.post(
      `${SERVER_URL}/api/device/${DEVICE_ID}/heartbeat`,
      {},
      {
        headers: { 'X-Device-Token': DEVICE_TOKEN },
        timeout: 3000,
      }
    );
    console.log(`💓 [${new Date().toLocaleTimeString()}] Heartbeat Ping Sent`);
  } catch (err: any) {
    console.error('Heartbeat error:', err.message);
  }
}

async function runSimulator() {
  console.log('\n==================================================');
  console.log('🤖 ESP32 LOCAL HARDWARE SIMULATOR STARTING');
  console.log('==================================================');

  // Retry connecting until backend server is reached
  let connected = false;
  while (!connected) {
    connected = await connectAndRegister();
    if (!connected) {
      await delay(3000);
    }
  }

  // Start Telemetry, Heartbeat & Command Polling Loops
  setInterval(pollCommands, 100);
  setInterval(sendTelemetry, 2000);
  setInterval(sendHeartbeat, 10000);

  // Periodically refresh hardware config every 30 seconds
  setInterval(updateHardwareConfig, 30000);
}

runSimulator();

import axios from 'axios';

const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:4000';
let DEVICE_ID = process.env.DEVICE_ID || 'ESP32-A7F92';
let DEVICE_TOKEN = process.env.DEVICE_TOKEN || '';

let simulatedLedState = false;
let simulatedBuzzerState = false;
let simulatedServoAngle = 0;

async function runSimulator() {
  console.log('\n==================================================');
  console.log('🤖 ESP32 LOCAL HARDWARE SIMULATOR STARTING');
  console.log('==================================================');
  console.log(`📡 Connecting to Backend: ${SERVER_URL}`);

  try {
    // 1. Fetch server info & registered devices to auto-register or pair device token
    const serverInfoRes = await axios.get(`${SERVER_URL}/api/server-info`).catch(() => null);
    if (serverInfoRes) {
      console.log(`🌐 Verified local server online at ${serverInfoRes.data.baseUrl}`);
    }

    const devicesRes = await axios.get(`${SERVER_URL}/api/devices`);
    const devices = devicesRes.data.devices || [];

    let targetDev = devices.find((d: any) => d.id === DEVICE_ID);

    if (!targetDev) {
      console.log(`⚙️ Creating new simulated device "Smart Room" (${DEVICE_ID})...`);
      const createRes = await axios.post(`${SERVER_URL}/api/devices`, { name: 'Smart Room (Simulated)' });
      targetDev = createRes.data.device;
      DEVICE_ID = targetDev.id;
      DEVICE_TOKEN = targetDev.token;
      console.log(`✅ Registered Device! ID: ${DEVICE_ID} | Token: ${DEVICE_TOKEN}`);
    } else {
      DEVICE_TOKEN = targetDev.token;
      console.log(`✅ Paired with existing Device: ${DEVICE_ID}`);
    }

    // 2. Fetch remote hardware config
    console.log(`📥 Downloading hardware config from ${SERVER_URL}/api/device/${DEVICE_ID}/config ...`);
    const configRes = await axios.get(`${SERVER_URL}/api/device/${DEVICE_ID}/config`, {
      headers: { 'X-Device-Token': DEVICE_TOKEN },
    });
    console.log('📋 Installed Hardware Components:', JSON.stringify(configRes.data.components, null, 2));

    // 3. Start Telemetry, Heartbeat & Command Polling Loops
    let baseTemp = 24.0;
    let baseHumidity = 55.0;
    let stepCount = 0;

    // Command Polling Interval (Every 100ms for fast real-time response)
    setInterval(async () => {
      try {
        const cmdRes = await axios.get(`${SERVER_URL}/api/device/${DEVICE_ID}/commands`, {
          headers: { 'X-Device-Token': DEVICE_TOKEN },
        });

        const commands = cmdRes.data.commands || [];
        for (const cmd of commands) {
          console.log(`\n⚡ SIMULATOR EXECUTING COMMAND [#${cmd.id}]: ${cmd.type} on GPIO ${cmd.gpio} -> Value: ${cmd.value}`);

          if (cmd.gpio === 18) simulatedLedState = cmd.value === 1;
          if (cmd.gpio === 19) simulatedBuzzerState = cmd.value === 1;
          if (cmd.gpio === 21) simulatedServoAngle = cmd.value;

          console.log(`   [Simulated Hardware State] LED: ${simulatedLedState ? '🟢 ON' : '🔴 OFF'} | Buzzer: ${simulatedBuzzerState ? '🔊 BEEPing' : '🔇 Mute'} | Servo: ${simulatedServoAngle}°`);

          // Send ACK
          await axios.post(`${SERVER_URL}/api/device/${DEVICE_ID}/commands/${cmd.id}/ack`, {}, {
            headers: { 'X-Device-Token': DEVICE_TOKEN },
          });
          console.log(`   ✅ Sent ACK for command #${cmd.id}`);
        }
      } catch (err: any) {
        console.error('Command poll error:', err.message);
      }
    }, 100);

    // Telemetry Posting Interval (Every 2 seconds)
    setInterval(async () => {
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
        });
        console.log(`📤 [${new Date().toLocaleTimeString()}] Telemetry Sent -> Temp: ${temperature}°C | Hum: ${humidity}% | Motion: ${motion ? '🏃 MOTION DETECTED' : '---'}`);
      } catch (err: any) {
        console.error('Telemetry post error:', err.message);
      }
    }, 2000);

    // Heartbeat Interval (Every 10 seconds)
    setInterval(async () => {
      try {
        await axios.post(`${SERVER_URL}/api/device/${DEVICE_ID}/heartbeat`, {}, {
          headers: { 'X-Device-Token': DEVICE_TOKEN },
        });
        console.log(`💓 [${new Date().toLocaleTimeString()}] Heartbeat Ping Sent`);
      } catch (err: any) {
        console.error('Heartbeat error:', err.message);
      }
    }, 10000);

  } catch (error: any) {
    console.error('Simulator Initialization Error:', error.message);
  }
}

runSimulator();

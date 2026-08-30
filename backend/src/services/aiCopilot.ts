import dotenv from 'dotenv';
dotenv.config();

export interface ParsedAutomationRule {
  name: string;
  sensor_component: 'DHT11' | 'PIR' | 'LDR' | 'HC-SR04' | 'PUSH_BUTTON' | string;
  condition: 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS' | 'DETECTED';
  trigger_value: number;
  action_component: 'LED' | 'BUZZER' | 'SERVO' | 'RELAY' | string;
  action_type: 'GPIO_WRITE' | 'SERVO_ANGLE';
  action_value: number;
  duration_seconds?: number;
  confidence: number;
  cpp_condition_code?: string;
}

export interface CopilotResponse {
  success: boolean;
  message: string;
  provider: 'Reka AI' | 'Deterministic Fallback';
  modelUsed?: string;
  rule?: ParsedAutomationRule;
  explanation: string;
  cpp_condition_code: string;
  updated_main_code?: string;
}

export class AICopilotService {
  private readonly rekaApiKey: string;
  private readonly rekaApiUrl = 'https://api.reka.ai/v1/chat/completions';
  private readonly defaultModel = 'reka-edge-2603';

  constructor() {
    this.rekaApiKey =
      process.env.REKA_API_KEY ||
      '182eafa853a49a5aa490e7597511e021e3e3f2d7cb47d9ff2e640ac680f7ee0d';
  }

  /**
   * Translates natural language automation prompt into structured IoT rule & C++ condition using Reka AI.
   */
  public async parsePrompt(
    prompt: string,
    deviceComponents: Array<{ type: string; gpio_pin: number; name?: string }> = []
  ): Promise<CopilotResponse> {
    try {
      if (this.rekaApiKey) {
        const rekaResult = await this.callRekaAI(prompt, deviceComponents);
        if (rekaResult) {
          return rekaResult;
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Reka AI API call error, switching to deterministic parser fallback:', err.message);
    }

    // Fallback to deterministic parser
    return this.deterministicParse(prompt, deviceComponents);
  }

  /**
   * Calls Reka AI REST API with structured system prompt
   */
  private async callRekaAI(
    prompt: string,
    deviceComponents: Array<{ type: string; gpio_pin: number; name?: string }>
  ): Promise<CopilotResponse | null> {
    const componentsList = deviceComponents.length > 0
      ? deviceComponents.map(c => `- ${c.type} (GPIO Pin ${c.gpio_pin})`).join('\n')
      : `- DHT11 (GPIO 4)\n- PIR (GPIO 5)\n- LDR (GPIO 34)\n- HC-SR04 (Trig 12 / Echo 13)\n- PUSH_BUTTON (GPIO 27)\n- LED (GPIO 18)\n- BUZZER (GPIO 19)\n- SERVO (GPIO 21)\n- RELAY (GPIO 22)`;

    const systemPrompt = `You are an expert embedded IoT and ESP32 automation engine AI.
Translate the user's natural language automation prompt into a structured IoT rule and non-blocking production ESP32 C++ Arduino condition code.

Target Hardware Setup:
${componentsList}

Supported Sensors:
- "DHT11" -> Condition: "GREATER_THAN", "LESS_THAN", "EQUALS". Variables: "temp" (°C) or "hum" (%).
- "PIR" -> Condition: "DETECTED" (trigger_value: 1). Variable: "digitalRead(PIR_PIN) == HIGH".
- "LDR" -> Condition: "GREATER_THAN", "LESS_THAN", "EQUALS". Variable: "analogRead(LDR_PIN)" (analog 0-4095).
- "HC-SR04" -> Condition: "GREATER_THAN", "LESS_THAN", "EQUALS". Variable: "distanceCm" (cm).
- "PUSH_BUTTON" -> Condition: "DETECTED" (trigger_value: 1). Variable: "digitalRead(BUTTON_PIN) == LOW".

Supported Actuators:
- "LED" -> Action: "GPIO_WRITE". Value: 1 (HIGH / ON) or 0 (LOW / OFF).
- "BUZZER" -> Action: "GPIO_WRITE". Value: 1 (HIGH / ON) or 0 (LOW / OFF).
- "SERVO" -> Action: "SERVO_ANGLE". Value: 0 to 180 (degrees).
- "RELAY" -> Action: "GPIO_WRITE". Value: 1 (HIGH / ON) or 0 (LOW / OFF).

Duration & Timed Auto-Off Logic:
- For momentary triggers (PIR motion detection or PUSH_BUTTON): include "duration_seconds" (default: 5 seconds, or parsed from user prompt like "for 10s").
- For continuous sensors (temperature, light): set "duration_seconds": 0 (state-based auto-reset: turns ON when condition is true, turns OFF when false).

You MUST return ONLY valid JSON matching this exact structure:
{
  "name": "Descriptive rule title",
  "sensor_component": "DHT11" | "PIR" | "LDR" | "HC-SR04" | "PUSH_BUTTON",
  "condition": "GREATER_THAN" | "LESS_THAN" | "EQUALS" | "DETECTED",
  "trigger_value": number,
  "action_component": "LED" | "BUZZER" | "SERVO" | "RELAY",
  "action_type": "GPIO_WRITE" | "SERVO_ANGLE",
  "action_value": number,
  "duration_seconds": number,
  "explanation": "Human readable explanation of the condition and automatic timed turn-off",
  "confidence": 0.98
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const modelsToTry = [this.defaultModel, 'reka-flash-3', 'deepseek4-flash'];
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch(this.rekaApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.rekaApiKey,
            'Authorization': `Bearer ${this.rekaApiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.1,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`Reka model ${model} returned HTTP ${response.status}: ${errText}`);
          continue;
        }

        const data: any = await response.json();
        clearTimeout(timeout);

        let content = data.choices?.[0]?.message?.content || '';
        content = content.replace(/```json/gi, '').replace(/```/g, '').trim();

        if (!content) continue;

        const parsed = JSON.parse(content);

        // Normalize Condition
        let cond = String(parsed.condition || 'GREATER_THAN').toUpperCase().replace(/\s+/g, '_');
        if (cond === 'GREATER' || cond === 'ABOVE' || cond === 'MORE_THAN') cond = 'GREATER_THAN';
        if (cond === 'LESS' || cond === 'BELOW' || cond === 'UNDER') cond = 'LESS_THAN';
        if (cond === 'EQUAL') cond = 'EQUALS';
        if (cond !== 'GREATER_THAN' && cond !== 'LESS_THAN' && cond !== 'EQUALS' && cond !== 'DETECTED') {
          cond = 'GREATER_THAN';
        }

        // Normalize Sensor
        let sensor = String(parsed.sensor_component || 'PIR').toUpperCase();
        if (sensor.includes('DHT') || sensor.includes('TEMP') || sensor.includes('HUMID')) sensor = 'DHT11';
        else if (sensor.includes('PIR') || sensor.includes('MOTION')) sensor = 'PIR';
        else if (sensor.includes('LDR') || sensor.includes('LIGHT') || sensor.includes('LUX')) sensor = 'LDR';
        else if (sensor.includes('DISTANCE') || sensor.includes('SONAR') || sensor.includes('ULTRASONIC') || sensor.includes('HC')) sensor = 'HC-SR04';
        else if (sensor.includes('BUTTON')) sensor = 'PUSH_BUTTON';

        // Normalize Actuator
        let actionComp = String(parsed.action_component || 'LED').toUpperCase();
        if (actionComp.includes('LED') || actionComp.includes('LIGHT')) actionComp = 'LED';
        else if (actionComp.includes('BUZZER') || actionComp.includes('ALARM') || actionComp.includes('BEEP')) actionComp = 'BUZZER';
        else if (actionComp.includes('SERVO') || actionComp.includes('MOTOR') || actionComp.includes('DOOR')) actionComp = 'SERVO';
        else if (actionComp.includes('RELAY') || actionComp.includes('SWITCH')) actionComp = 'RELAY';

        const actionType: 'GPIO_WRITE' | 'SERVO_ANGLE' = actionComp === 'SERVO' ? 'SERVO_ANGLE' : 'GPIO_WRITE';
        const actionVal = Number(parsed.action_value ?? 1);
        const triggerVal = Number(parsed.trigger_value ?? (sensor === 'PIR' ? 1 : 30));

        let durationSec = Number(parsed.duration_seconds ?? 0);
        if ((sensor === 'PIR' || sensor === 'PUSH_BUTTON') && durationSec <= 0) {
          durationSec = 5; // Default 5 second pulse for motion & button
        }

        const cppCode = this.generateCppSnippet(sensor, cond, triggerVal, actionComp, actionVal, durationSec);

        const rule: ParsedAutomationRule = {
          name: parsed.name || `IF ${sensor} ${cond} ${triggerVal} ➔ ${actionComp} = ${actionVal}${durationSec > 0 ? ` (${durationSec}s)` : ''}`,
          sensor_component: sensor,
          condition: cond as any,
          trigger_value: triggerVal,
          action_component: actionComp,
          action_type: actionType,
          action_value: actionVal,
          duration_seconds: durationSec,
          confidence: Number(parsed.confidence ?? 0.98),
          cpp_condition_code: cppCode,
        };

        const explanation = parsed.explanation || (durationSec > 0
          ? `When ${sensor} triggers ${cond} condition (${triggerVal}), ${actionComp} turns ON for ${durationSec} seconds, then automatically switches OFF.`
          : `When ${sensor} triggers ${cond} condition (${triggerVal}), ${actionComp} turns ON, and turns OFF automatically when condition ends.`);

        return {
          success: true,
          message: `Successfully understood and parsed with Reka AI (${model})`,
          provider: 'Reka AI',
          modelUsed: model,
          rule,
          explanation,
          cpp_condition_code: cppCode,
        };
      } catch (e) {
        lastError = e;
      }
    }

    clearTimeout(timeout);
    return null;
  }

  /**
   * Deterministic fallback when external AI API is unavailable
   */
  private deterministicParse(
    prompt: string,
    deviceComponents: Array<{ type: string; gpio_pin: number }>
  ): CopilotResponse {
    const text = prompt.toLowerCase();

    let sensor: any = 'PIR';
    let condition: 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS' | 'DETECTED' = 'DETECTED';
    let triggerVal = 1;
    let actionComp = 'LED';
    let actionType: 'GPIO_WRITE' | 'SERVO_ANGLE' = 'GPIO_WRITE';
    let actionVal = 1;
    let durationSec = 0;

    // Check for explicit duration in prompt (e.g. "for 5 seconds", "for 10s")
    const durMatch = text.match(/for\s+(\d+)\s*(s|sec|second|seconds)/);
    if (durMatch) {
      durationSec = parseInt(durMatch[1], 10);
    }

    if (text.includes('temp') || text.includes('dht') || text.includes('heat') || text.includes('warm') || text.includes('°c')) {
      sensor = 'DHT11';
    } else if (text.includes('motion') || text.includes('movement') || text.includes('pir') || text.includes('presence')) {
      sensor = 'PIR';
      if (!durMatch) durationSec = 5;
    } else if (text.includes('light') || text.includes('ldr') || text.includes('dark') || text.includes('lux')) {
      sensor = 'LDR';
    } else if (text.includes('distance') || text.includes('sonar') || text.includes('hc-sr04') || text.includes('proximity') || text.includes('cm')) {
      sensor = 'HC-SR04';
    } else if (text.includes('button') || text.includes('press')) {
      sensor = 'PUSH_BUTTON';
      if (!durMatch) durationSec = 5;
    }

    if (text.includes('led') || text.includes('light on') || text.includes('bulb')) {
      actionComp = 'LED';
      actionType = 'GPIO_WRITE';
      actionVal = text.includes('off') ? 0 : 1;
    } else if (text.includes('buzzer') || text.includes('alarm') || text.includes('beep') || text.includes('sound')) {
      actionComp = 'BUZZER';
      actionType = 'GPIO_WRITE';
      actionVal = text.includes('off') ? 0 : 1;
    } else if (text.includes('servo') || text.includes('rotate') || text.includes('angle') || text.includes('door')) {
      actionComp = 'SERVO';
      actionType = 'SERVO_ANGLE';
      const angleMatch = text.match(/(\d+)\s*(deg|degree|degrees|°)/);
      actionVal = angleMatch ? parseInt(angleMatch[1], 10) : 90;
    } else if (text.includes('relay') || text.includes('switch') || text.includes('plug') || text.includes('outlet')) {
      actionComp = 'RELAY';
      actionType = 'GPIO_WRITE';
      actionVal = text.includes('off') ? 0 : 1;
    }

    const numMatch = text.match(/(\d+(\.\d+)?)/);
    if (numMatch && sensor !== 'PIR' && sensor !== 'PUSH_BUTTON') {
      triggerVal = parseFloat(numMatch[1]);
      if (text.includes('above') || text.includes('exceed') || text.includes('greater') || text.includes('over') || text.includes('>') || text.includes('higher')) {
        condition = 'GREATER_THAN';
      } else if (text.includes('below') || text.includes('under') || text.includes('less') || text.includes('<') || text.includes('lower')) {
        condition = 'LESS_THAN';
      } else {
        condition = 'GREATER_THAN';
      }
    } else if (sensor === 'PIR' || sensor === 'PUSH_BUTTON') {
      condition = 'DETECTED';
      triggerVal = 1;
    }

    const ruleName = `IF ${sensor} ${condition} ${triggerVal} ➔ ${actionComp} = ${actionVal}${durationSec > 0 ? ` (${durationSec}s)` : ''}`;
    const cppSnippet = this.generateCppSnippet(sensor, condition, triggerVal, actionComp, actionVal, durationSec);

    return {
      success: true,
      message: `Parsed rule successfully using embedded edge rule engine.`,
      provider: 'Deterministic Fallback',
      explanation: durationSec > 0
        ? `If ${sensor} triggers ${condition} (${triggerVal}), ${actionComp} turns ON for ${durationSec} seconds, then automatically turns OFF.`
        : `If ${sensor} triggers condition ${condition} (${triggerVal}), ${actionComp} turns ON, and turns OFF when condition ends.`,
      cpp_condition_code: cppSnippet,
      rule: {
        name: ruleName,
        sensor_component: sensor,
        condition,
        trigger_value: triggerVal,
        action_component: actionComp,
        action_type: actionType,
        action_value: actionVal,
        duration_seconds: durationSec,
        confidence: 0.95,
        cpp_condition_code: cppSnippet,
      },
    };
  }

  /**
   * Generates production C++ Arduino code snippet for an individual rule with non-blocking timer / auto-reset
   */
  public generateCppSnippet(
    sensor: string,
    condition: string,
    triggerVal: number,
    actionComp: string,
    actionVal: number,
    durationSeconds: number = 0
  ): string {
    let check = '';
    if (sensor === 'DHT11') {
      const op = condition === 'GREATER_THAN' ? '>' : condition === 'LESS_THAN' ? '<' : '==';
      check = `temp ${op} ${triggerVal}.0`;
    } else if (sensor === 'PIR') {
      check = `digitalRead(PIR_PIN) == HIGH`;
    } else if (sensor === 'LDR') {
      const op = condition === 'GREATER_THAN' ? '>' : condition === 'LESS_THAN' ? '<' : '==';
      check = `analogRead(LDR_PIN) ${op} ${triggerVal}`;
    } else if (sensor === 'HC-SR04') {
      const op = condition === 'GREATER_THAN' ? '>' : condition === 'LESS_THAN' ? '<' : '==';
      check = `distanceCm ${op} ${triggerVal}.0`;
    } else if (sensor === 'PUSH_BUTTON') {
      check = `digitalRead(BUTTON_PIN) == LOW`;
    } else {
      check = `sensorValue > ${triggerVal}`;
    }

    const timerVar = `timer_${actionComp.toLowerCase()}`;
    const pinName = `${actionComp}_PIN`;

    if (actionComp === 'SERVO') {
      return `if (${check}) {\n    servoMotor.write(${actionVal});\n  }`;
    }

    // If a duration is specified (e.g. 5 seconds for PIR / button pulse)
    if (durationSeconds > 0) {
      const durationMs = durationSeconds * 1000;
      return `if (${check}) {\n    ${timerVar} = millis() + ${durationMs}; // Keep ON for ${durationSeconds}s\n    digitalWrite(${pinName}, HIGH);\n  } else if (millis() > ${timerVar}) {\n    digitalWrite(${pinName}, LOW);  // Auto-off after ${durationSeconds}s\n  }`;
    }

    // State-based auto-reset (e.g. temp > 32 turns LED HIGH, else turns LED LOW)
    const onState = actionVal === 1 ? 'HIGH' : 'LOW';
    const offState = actionVal === 1 ? 'LOW' : 'HIGH';
    return `if (${check}) {\n    digitalWrite(${pinName}, ${onState});\n  } else {\n    digitalWrite(${pinName}, ${offState}); // Auto-off when condition ends\n  }`;
  }

  /**
   * Generates the entire updated ESP32 C++ Arduino main loop function embedding all active automation conditions
   */
  public generateMainLoopCode(rules: Array<any>): string {
    const activeRules = rules.filter(r => r.is_active !== false);

    let conditionsCode = '';
    if (activeRules.length === 0) {
      conditionsCode = `  // No active smart automations configured yet.\n  // Use the AI Copilot to automatically inject real-time edge conditions.`;
    } else {
      conditionsCode = activeRules
        .map((r, i) => {
          let dur = Number(r.duration_seconds ?? 0);
          if ((r.sensor_component === 'PIR' || r.sensor_component === 'PUSH_BUTTON') && dur <= 0) {
            dur = 5;
          }
          const snippet = this.generateCppSnippet(
            r.sensor_component,
            r.condition,
            Number(r.trigger_value),
            r.action_component,
            Number(r.action_value),
            dur
          );
          return `  // Smart Automation Rule ${i + 1}: ${r.name}\n  ${snippet.replace(/\n/g, '\n  ')}`;
        })
        .join('\n\n');
    }

    return `// =======================================================
// ⚡ ESP32 LOCAL EDGE SMART AUTOMATION EVALUATION
// Auto-updated via Reka AI Copilot & Web Automation Studio
// =======================================================
unsigned long timer_led    = 0;
unsigned long timer_buzzer = 0;
unsigned long timer_relay  = 0;

void evaluateLocalAutomations() {
${conditionsCode}
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqttClient.connected()) connectMQTT();
  else mqttClient.loop();

  // 1. Evaluate Active Smart Edge Conditions Instantly (< 1ms latency)
  evaluateLocalAutomations();

  unsigned long currentMillis = millis();

  // 2. Transmit Telemetry Every 2000ms
  if (currentMillis - lastTelemetryTime >= 2000) {
    lastTelemetryTime = currentMillis;
    sendTelemetry();
  }

  delay(10);
}`;
  }
}

export const aiCopilotService = new AICopilotService();

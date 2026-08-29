export interface ParsedAutomationRule {
  name: string;
  sensor_component: string;
  condition: 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS' | 'DETECTED';
  trigger_value: number;
  action_component: string;
  action_type: 'GPIO_WRITE' | 'SERVO_ANGLE';
  action_value: number;
  confidence: number;
}

export interface CopilotResponse {
  success: boolean;
  message: string;
  rule?: ParsedAutomationRule;
  explanation: string;
}

export class AICopilotService {
  /**
   * Deterministically parses natural language user prompt into structured IoT automation rule.
   * Can be extended to call external AI APIs in future versions.
   */
  public async parsePrompt(prompt: string, deviceComponents: Array<{ type: string; gpio_pin: number }>): Promise<CopilotResponse> {
    const text = prompt.toLowerCase();

    let sensor = 'PIR';
    let condition: 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS' | 'DETECTED' = 'DETECTED';
    let triggerVal = 1;
    let actionComp = 'LED';
    let actionType: 'GPIO_WRITE' | 'SERVO_ANGLE' = 'GPIO_WRITE';
    let actionVal = 1;

    // Detect sensor component
    if (text.includes('temp') || text.includes('dht') || text.includes('heat') || text.includes('warm')) {
      sensor = 'DHT11';
    } else if (text.includes('motion') || text.includes('movement') || text.includes('pir') || text.includes('presence')) {
      sensor = 'PIR';
    } else if (text.includes('light') || text.includes('ldr') || text.includes('dark')) {
      sensor = 'LDR';
    } else if (text.includes('distance') || text.includes('sonar') || text.includes('hc-sr04') || text.includes('proximity')) {
      sensor = 'HC-SR04';
    } else if (text.includes('button') || text.includes('press')) {
      sensor = 'PUSH_BUTTON';
    }

    // Detect action component
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
    }

    // Detect condition & values
    const numMatch = text.match(/(\d+(\.\d+)?)/);
    if (numMatch && sensor === 'DHT11') {
      triggerVal = parseFloat(numMatch[1]);
      if (text.includes('above') || text.includes('exceed') || text.includes('greater') || text.includes('over') || text.includes('>')) {
        condition = 'GREATER_THAN';
      } else if (text.includes('below') || text.includes('under') || text.includes('less') || text.includes('<')) {
        condition = 'LESS_THAN';
      } else {
        condition = 'GREATER_THAN';
      }
    } else if (sensor === 'PIR') {
      condition = 'DETECTED';
      triggerVal = 1;
    }

    const ruleName = `AI Rule: ${actionComp} ${actionVal === 1 ? 'ON' : 'OFF'} if ${sensor} ${condition}`;

    return {
      success: true,
      message: `Parsed rule successfully using deterministic AI parser engine.`,
      explanation: `If ${sensor} triggers ${condition} condition (${triggerVal}), perform ${actionType} on ${actionComp} setting value to ${actionVal}.`,
      rule: {
        name: ruleName,
        sensor_component: sensor,
        condition,
        trigger_value: triggerVal,
        action_component: actionComp,
        action_type: actionType,
        action_value: actionVal,
        confidence: 0.95,
      },
    };
  }
}

export const aiCopilotService = new AICopilotService();

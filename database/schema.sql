-- PostgreSQL Schema for IoT-to-Web

CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    token VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'OFFLINE',
    ip_address VARCHAR(45) DEFAULT '',
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS components (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    gpio_pin INT NOT NULL,
    gpio_secondary INT DEFAULT -1,
    category VARCHAR(20) NOT NULL, -- 'INPUT' or 'OUTPUT'
    config_json TEXT DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_device_gpio UNIQUE (device_id, gpio_pin)
);

CREATE TABLE IF NOT EXISTS sensor_readings (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE CASCADE,
    component_type VARCHAR(50) NOT NULL,
    reading_type VARCHAR(50) NOT NULL,
    value NUMERIC(10, 2) NOT NULL,
    raw_data TEXT DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automation_rules (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sensor_component VARCHAR(50) NOT NULL,
    condition VARCHAR(20) NOT NULL, -- 'EQUALS', 'GREATER_THAN', 'LESS_THAN', 'DETECTED'
    trigger_value NUMERIC(10, 2) DEFAULT 0,
    action_component VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'GPIO_WRITE', 'SERVO_ANGLE'
    action_value INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_commands (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE CASCADE,
    command_type VARCHAR(50) NOT NULL, -- 'GPIO_WRITE', 'SERVO_ANGLE'
    gpio_pin INT NOT NULL,
    value INT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'EXECUTED', 'FAILED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    executed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS device_events (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    details TEXT DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for fast queries
CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_time ON sensor_readings(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_pending ON device_commands(device_id, status);

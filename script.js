/* ==========================================================================
   MycoMonitor — Smart Mushroom Cultivation Monitoring System
   Pure Vanilla JavaScript · GitHub Pages & Chrome file:// Compatible
   ========================================================================== */

(function () {
  "use strict";

  /* ========================================================================
     1. SENSOR DATA ADAPTER LAYER (Isolated for Future ESP32 Integration)
     ========================================================================
     How to connect real ESP32 hardware later:
       1. Change SensorConfig.mode from "DEMO" to "ESP32_HTTP".
       2. Set SensorConfig.endpoints[roomId] to each ESP32 REST endpoint.
       3. Expected JSON response per node:
          {
            "deviceId": "ESP32-RM01",
            "temperature": 21.4,
            "humidity": 86.2,
            "co2": 640,
            "sensorOk": true,
            "rssi": -58,
            "timestamp": 1764091200000
          }
     ======================================================================== */
  const SensorConfig = {
    mode: "DEMO", // "DEMO" | "ESP32_HTTP"
    pollIntervalMs: 5000,
    endpoints: {
      "RM-01": "http://192.168.1.41/api/readings",
      "RM-02": "http://192.168.1.42/api/readings",
      "RM-03": "http://192.168.1.43/api/readings",
      "RM-04": "http://192.168.1.44/api/readings"
    }
  };

  /**
   * DemoSensorProvider simulates multi-room telemetry and fault scenarios.
   * Never misrepresents simulated readings as live physical sensor output.
   */
  const DemoSensorProvider = {
    roomScenarios: {
      "RM-01": "normal",
      "RM-02": "normal",
      "RM-03": "normal",
      "RM-04": "normal"
    },
    roomStates: {
      "RM-01": { temperature: 21.2, humidity: 86.4, co2: 615 },
      "RM-02": { temperature: 19.4, humidity: 89.2, co2: 580 },
      "RM-03": { temperature: 17.8, humidity: 83.5, co2: 540 },
      "RM-04": { temperature: 23.0, humidity: 78.0, co2: 740 }
    },

    setScenario(roomId, scenario) {
      this.roomScenarios[roomId] = scenario;
    },

    getScenario(roomId) {
      return this.roomScenarios[roomId] || "normal";
    },

    sampleRoom(room, thresholds, timestampMs) {
      const scenario = this.getScenario(room.id);
      const dev = state.devices.find((d) => d.roomId === room.id);

      // Handle simulated ESP32 disconnection
      if (scenario === "offline" || (dev && dev.forcedOffline)) {
        return {
          timestamp: timestampMs,
          roomId: room.id,
          deviceId: room.deviceId,
          temperature: null,
          humidity: null,
          co2: null,
          connected: false,
          sensorOk: false,
          rssi: null,
          source: "DEMO_SIMULATOR"
        };
      }

      // Handle simulated sensor failure (e.g. DHT22 checksum timeout)
      if (scenario === "sensor_fault" || (dev && dev.forcedSensorFault)) {
        return {
          timestamp: timestampMs,
          roomId: room.id,
          deviceId: room.deviceId,
          temperature: null,
          humidity: null,
          co2: Math.round(this.roomStates[room.id].co2),
          connected: true,
          sensorOk: false,
          rssi: -61,
          source: "DEMO_SIMULATOR"
        };
      }

      const targets = this._getTargets(room, thresholds, scenario);
      const cur = this.roomStates[room.id];

      cur.temperature = clamp(
        cur.temperature + (targets.temperature - cur.temperature) * 0.34 + randRange(-0.28, 0.28),
        8.0,
        36.0
      );
      cur.humidity = clamp(
        cur.humidity + (targets.humidity - cur.humidity) * 0.34 + randRange(-0.9, 0.9),
        40.0,
        99.5
      );
      cur.co2 = clamp(
        cur.co2 + (targets.co2 - cur.co2) * 0.34 + randRange(-20, 20),
        380,
        1950
      );

      return {
        timestamp: timestampMs,
        roomId: room.id,
        deviceId: room.deviceId,
        temperature: round1(cur.temperature),
        humidity: round1(cur.humidity),
        co2: Math.round(cur.co2),
        connected: true,
        sensorOk: true,
        rssi: -56 + Math.round(randRange(-4, 3)),
        source: "DEMO_SIMULATOR"
      };
    },

    _getTargets(room, thresholds, scenario) {
      const midT = (thresholds.tempMin + thresholds.tempMax) / 2;
      const midH = (thresholds.humMin + thresholds.humMax) / 2;
      const phase = Date.now() / 42000 + room.id.charCodeAt(4);

      switch (scenario) {
        case "high_temp":
          return { temperature: thresholds.tempMax + 3.4, humidity: midH - 4, co2: 720 };
        case "low_temp":
          return { temperature: thresholds.tempMin - 3.2, humidity: midH + 2, co2: 590 };
        case "low_humidity":
          return { temperature: midT + 0.8, humidity: thresholds.humMin - 11.5, co2: 650 };
        case "high_humidity":
          return { temperature: midT - 0.5, humidity: Math.min(99, thresholds.humMax + 5.5), co2: 710 };
        case "high_co2":
          return { temperature: midT + 0.7, humidity: midH, co2: thresholds.co2Crit + 180 };
        case "normal":
        default:
          return {
            temperature: room.baselineTemp + Math.sin(phase) * 0.65,
            humidity: room.baselineHum + Math.cos(phase) * 1.6,
            co2: room.baselineCo2 + Math.sin(phase * 1.2) * 45
          };
      }
    },

    generate30DayAnalytics(rooms, thresholds) {
      const records = [];
      const today = new Date();
      today.setHours(12, 0, 0, 0);

      for (let d = 29; d >= 0; d--) {
        const dt = new Date(today.getTime() - d * 86400000);
        const dateStr = formatDate(dt.getTime());

        rooms.forEach((room, idx) => {
          const wave = Math.sin((d + idx * 2) * 0.45);
          const avgTemp = round1(room.baselineTemp + wave * 1.1 + randRange(-0.4, 0.4));
          const minTemp = round1(avgTemp - randRange(1.0, 2.1));
          const maxTemp = round1(avgTemp + randRange(1.1, 2.4));
          const avgHum = round1(clamp(room.baselineHum + Math.cos(d * 0.5 + idx) * 2.8 + randRange(-1.2, 1.2), 62, 97));
          const avgCo2 = Math.round(clamp(room.baselineCo2 + wave * 85 + randRange(-35, 45), 420, 1250));

          const inTemp = avgTemp >= thresholds.tempMin && avgTemp <= thresholds.tempMax;
          const inHum = avgHum >= thresholds.humMin && avgHum <= thresholds.humMax;
          const inCo2 = avgCo2 <= thresholds.co2Warn;
          const stability = Math.round(((inTemp ? 35 : 15) + (inHum ? 35 : 15) + (inCo2 ? 30 : 12)) - randRange(0, 6));

          records.push({
            date: dateStr,
            roomId: room.id,
            roomName: room.name,
            avgTemp,
            minTemp,
            maxTemp,
            avgHum,
            avgCo2,
            stability: clamp(stability, 58, 100)
          });
        });
      }
      return records;
    }
  };

  /**
   * Future Hardware Integration Provider (ready for ESP32 HTTP REST nodes).
   */
  const Esp32HttpProvider = {
    async sampleRoom(room) {
      const url = SensorConfig.endpoints[room.id];
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      return {
        timestamp: data.timestamp || Date.now(),
        roomId: room.id,
        deviceId: data.deviceId || room.deviceId,
        temperature: data.temperature != null ? round1(Number(data.temperature)) : null,
        humidity: data.humidity != null ? round1(Number(data.humidity)) : null,
        co2: data.co2 != null ? Math.round(Number(data.co2)) : null,
        connected: true,
        sensorOk: data.sensorOk !== false,
        rssi: typeof data.rssi === "number" ? data.rssi : -60,
        source: "ESP32_HARDWARE"
      };
    }
  };

  const SensorDataAdapter = {
    async pollAllRooms(rooms, thresholds) {
      const now = Date.now();
      const results = [];
      for (const room of rooms) {
        if (SensorConfig.mode === "ESP32_HTTP") {
          try {
            results.push(await Esp32HttpProvider.sampleRoom(room));
          } catch (_err) {
            results.push({
              timestamp: now,
              roomId: room.id,
              deviceId: room.deviceId,
              temperature: null,
              humidity: null,
              co2: null,
              connected: false,
              sensorOk: false,
              rssi: null,
              source: "ESP32_HARDWARE"
            });
          }
        } else {
          results.push(DemoSensorProvider.sampleRoom(room, thresholds, now));
        }
      }
      return results;
    }
  };

  /* ========================================================================
     2. DEFAULT DOMAIN DATA & PERSISTENCE
     ======================================================================== */
  const DEFAULT_THRESHOLDS = {
    tempMin: 18.0,
    tempMax: 24.0,
    humMin: 80,
    humMax: 92,
    co2Warn: 900,
    co2Crit: 1200
  };

  const INITIAL_ROOMS = [
    {
      id: "RM-01",
      name: "North Fruiting Bay",
      variety: "Pearl Oyster (Pleurotus ostreatus)",
      capacityUsed: 420,
      capacityMax: 480,
      batchId: "BATCH-2026-041",
      deviceId: "ESP32-RM01",
      baselineTemp: 21.2,
      baselineHum: 86.0,
      baselineCo2: 615
    },
    {
      id: "RM-02",
      name: "East Canopy Chamber",
      variety: "Lion's Mane (Hericium erinaceus)",
      capacityUsed: 310,
      capacityMax: 360,
      batchId: "BATCH-2026-042",
      deviceId: "ESP32-RM02",
      baselineTemp: 19.6,
      baselineHum: 89.0,
      baselineCo2: 580
    },
    {
      id: "RM-03",
      name: "Shiitake Conditioning",
      variety: "Shiitake (Lentinula edodes)",
      capacityUsed: 265,
      capacityMax: 320,
      batchId: "BATCH-2026-043",
      deviceId: "ESP32-RM03",
      baselineTemp: 18.5,
      baselineHum: 83.5,
      baselineCo2: 540
    },
    {
      id: "RM-04",
      name: "Incubation Vault",
      variety: "King Trumpet (Pleurotus eryngii)",
      capacityUsed: 380,
      capacityMax: 400,
      batchId: "BATCH-2026-044",
      deviceId: "ESP32-RM04",
      baselineTemp: 22.8,
      baselineHum: 81.5,
      baselineCo2: 720
    }
  ];

  const INITIAL_BATCHES = [
    {
      id: "BATCH-2026-041",
      species: "Pearl Oyster",
      roomId: "RM-01",
      prepDate: "2026-11-04",
      inocDate: "2026-11-06",
      stage: "Fruiting",
      harvestDate: "2026-11-28",
      status: "Active",
      notes: "Uniform cap expansion across racks 1–4; FAE cycle balanced."
    },
    {
      id: "BATCH-2026-042",
      species: "Lion's Mane",
      roomId: "RM-02",
      prepDate: "2026-11-02",
      inocDate: "2026-11-05",
      stage: "Pinning",
      harvestDate: "2026-12-02",
      status: "Monitoring",
      notes: "Dense primordia forming; maintaining high humidity (88–90%)."
    },
    {
      id: "BATCH-2026-043",
      species: "Shiitake",
      roomId: "RM-03",
      prepDate: "2026-10-20",
      inocDate: "2026-10-24",
      stage: "Harvest Ready",
      harvestDate: "2026-11-26",
      status: "Harvest Ready",
      notes: "First flush caps 75% open; scheduled for morning harvest."
    },
    {
      id: "BATCH-2026-044",
      species: "King Trumpet",
      roomId: "RM-04",
      prepDate: "2026-11-16",
      inocDate: "2026-11-18",
      stage: "Incubation",
      harvestDate: "2026-12-14",
      status: "Active",
      notes: "85% mycelial colonization on supplemented hardwood sawdust."
    }
  ];

  const INITIAL_DEVICES = [
    {
      deviceId: "ESP32-RM01",
      mac: "24:6F:28:A1:4C:08",
      ip: "192.168.1.41",
      roomId: "RM-01",
      location: "RM-01 North Fruiting Bay — Rack B2",
      sensors: "DHT22 (GPIO 4) · SCD40 CO₂ (I2C)",
      firmware: "v2.1.0-myco",
      forcedOffline: false,
      forcedSensorFault: false
    },
    {
      deviceId: "ESP32-RM02",
      mac: "24:6F:28:A1:4C:14",
      ip: "192.168.1.42",
      roomId: "RM-02",
      location: "RM-02 East Canopy — Central Mast",
      sensors: "BME280 (I2C) · MH-Z19B CO₂ (UART)",
      firmware: "v2.1.0-myco",
      forcedOffline: false,
      forcedSensorFault: false
    },
    {
      deviceId: "ESP32-RM03",
      mac: "24:6F:28:B9:12:3A",
      ip: "192.168.1.43",
      roomId: "RM-03",
      location: "RM-03 Shiitake Conditioning — North Wall",
      sensors: "DHT22 (GPIO 4) · MQ-135 (ADC 34)",
      firmware: "v2.0.8-myco",
      forcedOffline: false,
      forcedSensorFault: false
    },
    {
      deviceId: "ESP32-RM04",
      mac: "24:6F:28:C0:77:9E",
      ip: "192.168.1.44",
      roomId: "RM-04",
      location: "RM-04 Incubation Vault — Ceiling Manifold",
      sensors: "BME280 (I2C) · SCD40 CO₂ (I2C)",
      firmware: "v2.1.0-myco",
      forcedOffline: false,
      forcedSensorFault: false
    }
  ];

  /* ========================================================================
     3. APPLICATION STATE
     ======================================================================== */
  const STORAGE_KEYS = {
    thresholds: "mycomonitor_thresholds_v1",
    batches: "mycomonitor_batches_v1",
    prefs: "mycomonitor_prefs_v1"
  };

  const state = {
    activePage: "overview",
    selectedRoomId: "RM-01",
    isStreaming: true,
    countdownSec: 5,
    liveWindow: 15,
    showBaselineComparison: true,
    rooms: INITIAL_ROOMS.map((r) => ({ ...r })),
    devices: INITIAL_DEVICES.map((d) => ({ ...d })),
    batches: loadStorage(STORAGE_KEYS.batches, INITIAL_BATCHES),
    thresholds: loadStorage(STORAGE_KEYS.thresholds, { ...DEFAULT_THRESHOLDS }),
    prefs: loadStorage(STORAGE_KEYS.prefs, {
      tempAlerts: true,
      humAlerts: true,
      co2Alerts: true,
      deviceAlerts: true,
      pollIntervalMs: 5000,
      defaultRoomId: "RM-01"
    }),
    roomReadings: { "RM-01": [], "RM-02": [], "RM-03": [], "RM-04": [] },
    recentGlobalReadings: [],
    analyticsDaily: [],
    alerts: [],
    filters: {
      roomsQuery: "",
      roomsStatus: "all",
      batchesQuery: "",
      batchesStage: "all",
      alertsQuery: "",
      alertsSeverity: "all",
      devicesQuery: "",
      devicesStatus: "all",
      anDateStart: "",
      anDateEnd: "",
      anRoomId: "ALL",
      anTableQuery: ""
    }
  };

  /* ========================================================================
     4. EVALUATION & ALERT ENGINE (All 7 Alert Types)
     ======================================================================== */
  function evaluateReading(reading, thresholds) {
    if (!reading || !reading.connected) {
      return {
        overall: "Critical",
        overallClass: "critical",
        tempStatus: "Offline",
        tempClass: "critical",
        humStatus: "Offline",
        humClass: "critical",
        co2Status: "Offline",
        co2Class: "critical"
      };
    }

    if (!reading.sensorOk || reading.temperature === null || reading.humidity === null) {
      return {
        overall: "Critical",
        overallClass: "critical",
        tempStatus: "Sensor Fault",
        tempClass: "critical",
        humStatus: "Sensor Fault",
        humClass: "critical",
        co2Status: reading.co2 >= thresholds.co2Warn ? "Warning" : "Normal",
        co2Class: reading.co2 >= thresholds.co2Warn ? "warning" : "optimal"
      };
    }

    // Temperature
    let tempStatus = "Normal";
    let tempClass = "optimal";
    if (reading.temperature >= thresholds.tempMax + 2.5 || reading.temperature <= thresholds.tempMin - 2.5) {
      tempStatus = reading.temperature > thresholds.tempMax ? "High Critical" : "Low Critical";
      tempClass = "critical";
    } else if (reading.temperature > thresholds.tempMax || reading.temperature < thresholds.tempMin) {
      tempStatus = reading.temperature > thresholds.tempMax ? "High Temp" : "Low Temp";
      tempClass = "warning";
    }

    // Humidity
    let humStatus = "Normal";
    let humClass = "optimal";
    if (reading.humidity <= thresholds.humMin - 8 || reading.humidity >= thresholds.humMax + 5) {
      humStatus = reading.humidity < thresholds.humMin ? "Low Critical" : "Excess Critical";
      humClass = "critical";
    } else if (reading.humidity < thresholds.humMin || reading.humidity > thresholds.humMax) {
      humStatus = reading.humidity < thresholds.humMin ? "Low Humidity" : "Excess Humidity";
      humClass = "warning";
    }

    // CO2
    let co2Status = "Normal";
    let co2Class = "optimal";
    if (reading.co2 >= thresholds.co2Crit) {
      co2Status = "High Critical";
      co2Class = "critical";
    } else if (reading.co2 >= thresholds.co2Warn) {
      co2Status = "High CO₂";
      co2Class = "warning";
    }

    const classes = [tempClass, humClass, co2Class];
    let overall = "Normal";
    let overallClass = "optimal";
    if (classes.includes("critical")) {
      overall = "Critical";
      overallClass = "critical";
    } else if (classes.includes("warning")) {
      overall = "Warning";
      overallClass = "warning";
    }

    return { overall, overallClass, tempStatus, tempClass, humStatus, humClass, co2Status, co2Class };
  }

  function processAlerts(reading, ev) {
    const t = state.thresholds;
    const room = state.rooms.find((r) => r.id === reading.roomId);
    const roomLabel = room ? `${room.id} (${room.name})` : reading.roomId;

    // 1. ESP32 Disconnection Alert
    if (!reading.connected) {
      if (state.prefs.deviceAlerts) {
        addOrUpdateAlert({
          key: `${reading.roomId}_disconnect`,
          roomId: reading.roomId,
          severity: "Critical",
          type: "ESP32 Disconnection",
          title: `ESP32 Disconnected — ${roomLabel}`,
          message: `Node ${reading.deviceId} stopped responding to telemetry heartbeat.`,
          action: "Inspect 5V USB power rail, Wi-Fi RSSI, and local router DHCP lease.",
          timestamp: reading.timestamp
        });
      }
      return;
    }

    // 2. Sensor Failure Warning
    if (!reading.sensorOk) {
      if (state.prefs.deviceAlerts) {
        addOrUpdateAlert({
          key: `${reading.roomId}_sensor_fault`,
          roomId: reading.roomId,
          severity: "Critical",
          type: "Sensor Failure",
          title: `Sensor Failure Detected — ${roomLabel}`,
          message: `Temperature/Humidity probe on ${reading.deviceId} returned invalid checksum (NaN).`,
          action: "Verify DHT22/BME280 data pin wiring and pull-up resistor.",
          timestamp: reading.timestamp
        });
      }
      return;
    }

    // 3 & 4. High / Low Temperature Warnings
    if (state.prefs.tempAlerts) {
      if (reading.temperature > t.tempMax) {
        const isCrit = reading.temperature >= t.tempMax + 2.5;
        addOrUpdateAlert({
          key: `${reading.roomId}_high_temp`,
          roomId: reading.roomId,
          severity: isCrit ? "Critical" : "Warning",
          type: "High Temperature",
          title: `High Temperature Warning — ${roomLabel}`,
          message: `Measured ${reading.temperature.toFixed(1)} °C exceeds max target of ${t.tempMax.toFixed(1)} °C.`,
          action: "Increase fresh intake cooling or reduce ambient heater duty.",
          timestamp: reading.timestamp
        });
      } else if (reading.temperature < t.tempMin) {
        const isCrit = reading.temperature <= t.tempMin - 2.5;
        addOrUpdateAlert({
          key: `${reading.roomId}_low_temp`,
          roomId: reading.roomId,
          severity: isCrit ? "Critical" : "Warning",
          type: "Low Temperature",
          title: `Low Temperature Warning — ${roomLabel}`,
          message: `Measured ${reading.temperature.toFixed(1)} °C dropped below min target of ${t.tempMin.toFixed(1)} °C.`,
          action: "Check bay insulation and engage auxiliary thermal heating.",
          timestamp: reading.timestamp
        });
      }
    }

    // 5 & 6. Low / Excessive Humidity Warnings
    if (state.prefs.humAlerts) {
      if (reading.humidity < t.humMin) {
        const isCrit = reading.humidity <= t.humMin - 8;
        addOrUpdateAlert({
          key: `${reading.roomId}_low_hum`,
          roomId: reading.roomId,
          severity: isCrit ? "Critical" : "Warning",
          type: "Low Humidity",
          title: `Low Humidity Warning — ${roomLabel}`,
          message: `Relative humidity fell to ${reading.humidity.toFixed(1)}% (min target ${t.humMin}%).`,
          action: "Increase ultrasonic fogger cycle duration.",
          timestamp: reading.timestamp
        });
      } else if (reading.humidity > t.humMax) {
        const isCrit = reading.humidity >= t.humMax + 5;
        addOrUpdateAlert({
          key: `${reading.roomId}_high_hum`,
          roomId: reading.roomId,
          severity: isCrit ? "Critical" : "Warning",
          type: "Excessive Humidity",
          title: `Excessive Humidity Warning — ${roomLabel}`,
          message: `Relative humidity climbed to ${reading.humidity.toFixed(1)}% (max target ${t.humMax}%).`,
          action: "Pause misting and run exhaust fan to prevent cap condensation.",
          timestamp: reading.timestamp
        });
      }
    }

    // 7. High CO2 Warning
    if (state.prefs.co2Alerts && reading.co2 >= t.co2Warn) {
      const isCrit = reading.co2 >= t.co2Crit;
      addOrUpdateAlert({
        key: `${reading.roomId}_high_co2`,
        roomId: reading.roomId,
        severity: isCrit ? "Critical" : "Warning",
        type: "High CO₂",
        title: `High CO₂ Warning — ${roomLabel}`,
        message: `CO₂ concentration reached ${reading.co2} ppm (warning limit ${t.co2Warn} ppm).`,
        action: "Boost fresh air exchange fan PWM to prevent elongated stems.",
        timestamp: reading.timestamp
      });
    }
  }

  function addOrUpdateAlert(item) {
    const existing = state.alerts.find((a) => !a.resolved && a.key === item.key);
    if (existing) {
      existing.message = item.message;
      existing.severity = item.severity;
      existing.timestamp = item.timestamp;
      return;
    }

    state.alerts.unshift({
      id: "ALT-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
      key: item.key,
      roomId: item.roomId,
      severity: item.severity,
      type: item.type,
      title: item.title,
      message: item.message,
      action: item.action,
      timestamp: item.timestamp,
      resolved: false
    });

    if (state.alerts.length > 80) state.alerts.length = 80;
  }

  function seedInitialAlerts() {
    const now = Date.now();
    state.alerts = [
      {
        id: "ALT-H101",
        key: "seed_low_hum",
        roomId: "RM-01",
        severity: "Normal",
        type: "Low Humidity",
        title: "Low Humidity Warning (Resolved) — RM-01 (North Fruiting Bay)",
        message: "Relative humidity dipped to 76.8% during morning air purge; restored to 86.0%.",
        action: "Ultrasonic humidifier cycled for 3 minutes.",
        timestamp: now - 38 * 60 * 1000,
        resolved: true
      },
      {
        id: "ALT-H102",
        key: "seed_high_co2",
        roomId: "RM-04",
        severity: "Normal",
        type: "High CO₂",
        title: "High CO₂ Warning (Resolved) — RM-04 (Incubation Vault)",
        message: "CO₂ peaked at 965 ppm; fresh air intake damper opened automatically.",
        action: "Exhaust fan ran at 60% PWM for 5 minutes.",
        timestamp: now - 95 * 60 * 1000,
        resolved: true
      },
      {
        id: "ALT-H103",
        key: "seed_high_temp",
        roomId: "RM-02",
        severity: "Normal",
        type: "High Temperature",
        title: "High Temperature Warning (Resolved) — RM-02 (East Canopy Chamber)",
        message: "Afternoon ambient spike brought bay temperature to 24.6 °C briefly.",
        action: "Intake cooling fan stabilized temperature at 19.6 °C.",
        timestamp: now - 210 * 60 * 1000,
        resolved: true
      }
    ];
  }

  /* ========================================================================
     5. INTERACTIVE SVG CHART ENGINE
     ======================================================================== */
  function renderLineChart(containerEl, opts) {
    if (!containerEl || !opts.data.length) {
      if (containerEl) {
        containerEl.innerHTML = `<div class="empty-state"><p>No valid telemetry points available for this chart.</p></div>`;
      }
      return;
    }

    const data = opts.data;
    const width = Math.max(containerEl.clientWidth || 720, 320);
    const height = containerEl.clientHeight || 240;
    const pad = { top: 18, right: 18, bottom: 30, left: 52 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const minVal = opts.yMin;
    const maxVal = opts.yMax;
    const span = maxVal - minVal || 1;

    const xFor = (i) =>
      data.length === 1 ? pad.left + plotW / 2 : pad.left + (i / (data.length - 1)) * plotW;
    const yFor = (val) => pad.top + plotH - ((clamp(val, minVal, maxVal) - minVal) / span) * plotH;

    let gridSvg = "";
    for (let t = 0; t <= 4; t++) {
      const val = minVal + (t / 4) * span;
      const y = yFor(val);
      gridSvg += `<line class="chart-grid-line" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" />`;
      gridSvg += `<text class="chart-axis-text" x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${opts.formatAxis(val)}</text>`;
    }

    let xTicksSvg = "";
    const step = Math.max(1, Math.floor((data.length - 1) / 4));
    for (let i = 0; i < data.length; i += step) {
      xTicksSvg += `<text class="chart-axis-text" x="${xFor(i).toFixed(1)}" y="${height - 8}" text-anchor="middle">${opts.formatX(data[i])}</text>`;
    }

    let optBandSvg = "";
    if (opts.optMin != null && opts.optMax != null) {
      const bTop = yFor(opts.optMax);
      const bBot = yFor(opts.optMin);
      optBandSvg = `<rect class="chart-optimal-band" x="${pad.left}" y="${bTop.toFixed(1)}" width="${plotW}" height="${Math.max(0, bBot - bTop).toFixed(1)}" />`;
    }

    let warnSvg = "";
    if (opts.warnLine != null) {
      const wy = yFor(opts.warnLine);
      warnSvg = `<line class="chart-threshold-line" x1="${pad.left}" y1="${wy.toFixed(1)}" x2="${width - pad.right}" y2="${wy.toFixed(1)}" />`;
    }

    // Optional envelope band (for daily min/max)
    let envSvg = "";
    if (opts.minAccessor && opts.maxAccessor) {
      const upper = data.map((d, i) => `${xFor(i).toFixed(1)},${yFor(opts.maxAccessor(d)).toFixed(1)}`);
      const lower = data
        .slice()
        .reverse()
        .map((d, idx) => {
          const origIdx = data.length - 1 - idx;
          return `${xFor(origIdx).toFixed(1)},${yFor(opts.minAccessor(d)).toFixed(1)}`;
        });
      envSvg = `<polygon class="chart-envelope-band" points="${upper.concat(lower).join(" ")}" />`;
    }

    // Optional 24h baseline comparison line
    let baselineSvg = "";
    if (opts.baselineAccessor) {
      const basePts = data.map((d, i) => `${xFor(i).toFixed(1)},${yFor(opts.baselineAccessor(d, i)).toFixed(1)}`);
      baselineSvg = `<polyline class="chart-baseline-line" points="${basePts.join(" ")}" />`;
    }

    // Primary line (handle null gaps gracefully by filtering valid points)
    const validPairs = data
      .map((d, i) => ({ d, i, v: opts.accessor(d) }))
      .filter((p) => p.v !== null && !Number.isNaN(p.v));

    let lineSvg = "";
    let areaSvg = "";
    if (validPairs.length > 0) {
      const pts = validPairs.map((p) => `${xFor(p.i).toFixed(1)},${yFor(p.v).toFixed(1)}`);
      const baseY = (pad.top + plotH).toFixed(1);
      const firstX = xFor(validPairs[0].i).toFixed(1);
      const lastX = xFor(validPairs[validPairs.length - 1].i).toFixed(1);
      areaSvg = `<path class="chart-area-fill" d="M ${firstX},${baseY} L ${pts.join(" L ")} L ${lastX},${baseY} Z" />`;
      lineSvg = `<polyline class="chart-line-primary" points="${pts.join(" ")}" />`;
    }

    containerEl.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(opts.ariaLabel)}">
        ${optBandSvg}
        ${envSvg}
        ${gridSvg}
        ${warnSvg}
        ${areaSvg}
        ${baselineSvg}
        ${lineSvg}
        ${xTicksSvg}
        <line class="chart-hover-line is-hidden" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + plotH}" />
        <circle class="chart-hover-dot is-hidden" cx="0" cy="0" r="4.5" />
      </svg>
      <div class="chart-tooltip is-hidden">
        <div class="chart-tooltip-time"></div>
        <div class="chart-tooltip-val"></div>
      </div>
    `;

    const svg = containerEl.querySelector("svg");
    const hoverLine = containerEl.querySelector(".chart-hover-line");
    const hoverDot = containerEl.querySelector(".chart-hover-dot");
    const tooltip = containerEl.querySelector(".chart-tooltip");
    const tTime = tooltip.querySelector(".chart-tooltip-time");
    const tVal = tooltip.querySelector(".chart-tooltip-val");

    svg.addEventListener("pointermove", (evt) => {
      const rect = svg.getBoundingClientRect();
      const relX = ((evt.clientX - rect.left) / rect.width) * width;
      const ratio = plotW > 0 ? (clamp(relX, pad.left, width - pad.right) - pad.left) / plotW : 0;
      const idx = Math.round(ratio * (data.length - 1));
      const item = data[idx];
      if (!item) return;

      const cx = xFor(idx);
      const val = opts.accessor(item);

      hoverLine.setAttribute("x1", cx.toFixed(1));
      hoverLine.setAttribute("x2", cx.toFixed(1));
      hoverLine.classList.remove("is-hidden");

      if (val !== null && !Number.isNaN(val)) {
        hoverDot.setAttribute("cx", cx.toFixed(1));
        hoverDot.setAttribute("cy", yFor(val).toFixed(1));
        hoverDot.classList.remove("is-hidden");
        tVal.textContent = opts.formatTooltip(item, val);
      } else {
        hoverDot.classList.add("is-hidden");
        tVal.textContent = "No reading (Offline / Fault)";
      }

      tTime.textContent = opts.formatXTooltip ? opts.formatXTooltip(item) : opts.formatX(item);
      tooltip.classList.remove("is-hidden");
    });

    svg.addEventListener("pointerleave", () => {
      hoverLine.classList.add("is-hidden");
      hoverDot.classList.add("is-hidden");
      tooltip.classList.add("is-hidden");
    });
  }

  function renderDualOverviewChart(containerEl, data) {
    if (!containerEl || !data.length) return;
    const valid = data.filter((d) => d.temperature !== null && d.humidity !== null);
    if (!valid.length) {
      containerEl.innerHTML = `<div class="empty-state"><p>No active sensor points for this room.</p></div>`;
      return;
    }

    const width = Math.max(containerEl.clientWidth || 560, 300);
    const height = containerEl.clientHeight || 215;
    const pad = { top: 18, right: 44, bottom: 28, left: 44 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const xFor = (i) =>
      valid.length === 1 ? pad.left + plotW / 2 : pad.left + (i / (valid.length - 1)) * plotW;
    const yTemp = (t) => pad.top + plotH - ((clamp(t, 10, 35) - 10) / 25) * plotH;
    const yHum = (h) => pad.top + plotH - ((clamp(h, 45, 100) - 45) / 55) * plotH;

    let gridSvg = "";
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * plotH;
      const tLabel = Math.round(35 - (i / 4) * 25);
      const hLabel = Math.round(100 - (i / 4) * 55);
      gridSvg += `<line class="chart-grid-line" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" />`;
      gridSvg += `<text class="chart-axis-text" x="${pad.left - 7}" y="${(y + 4).toFixed(1)}" text-anchor="end">${tLabel}°</text>`;
      gridSvg += `<text class="chart-axis-text" x="${width - pad.right + 7}" y="${(y + 4).toFixed(1)}" text-anchor="start">${hLabel}%</text>`;
    }

    let xTicksSvg = "";
    const step = Math.max(1, Math.floor((valid.length - 1) / 3));
    for (let i = 0; i < valid.length; i += step) {
      xTicksSvg += `<text class="chart-axis-text" x="${xFor(i).toFixed(1)}" y="${height - 8}" text-anchor="middle">${formatTime(valid[i].timestamp)}</text>`;
    }

    const tempPts = valid.map((d, i) => `${xFor(i).toFixed(1)},${yTemp(d.temperature).toFixed(1)}`).join(" ");
    const humPts = valid.map((d, i) => `${xFor(i).toFixed(1)},${yHum(d.humidity).toFixed(1)}`).join(" ");

    containerEl.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Temperature and humidity trend">
        ${gridSvg}
        <polyline class="chart-line-secondary" points="${humPts}" />
        <polyline class="chart-line-primary" points="${tempPts}" />
        ${xTicksSvg}
        <line class="chart-hover-line is-hidden" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + plotH}" />
        <circle class="chart-hover-dot is-hidden" cx="0" cy="0" r="4" />
        <circle class="chart-hover-dot-secondary is-hidden" cx="0" cy="0" r="4" />
      </svg>
      <div class="chart-tooltip is-hidden">
        <div class="chart-tooltip-time"></div>
        <div class="chart-tooltip-val"></div>
      </div>
    `;

    const svg = containerEl.querySelector("svg");
    const hoverLine = containerEl.querySelector(".chart-hover-line");
    const dotT = containerEl.querySelector(".chart-hover-dot");
    const dotH = containerEl.querySelector(".chart-hover-dot-secondary");
    const tooltip = containerEl.querySelector(".chart-tooltip");
    const tTime = tooltip.querySelector(".chart-tooltip-time");
    const tVal = tooltip.querySelector(".chart-tooltip-val");

    svg.addEventListener("pointermove", (evt) => {
      const rect = svg.getBoundingClientRect();
      const relX = ((evt.clientX - rect.left) / rect.width) * width;
      const ratio = plotW > 0 ? (clamp(relX, pad.left, width - pad.right) - pad.left) / plotW : 0;
      const idx = Math.round(ratio * (valid.length - 1));
      const item = valid[idx];
      if (!item) return;

      const cx = xFor(idx);
      hoverLine.setAttribute("x1", cx.toFixed(1));
      hoverLine.setAttribute("x2", cx.toFixed(1));
      hoverLine.classList.remove("is-hidden");

      dotT.setAttribute("cx", cx.toFixed(1));
      dotT.setAttribute("cy", yTemp(item.temperature).toFixed(1));
      dotT.classList.remove("is-hidden");

      dotH.setAttribute("cx", cx.toFixed(1));
      dotH.setAttribute("cy", yHum(item.humidity).toFixed(1));
      dotH.classList.remove("is-hidden");

      tTime.textContent = formatTime(item.timestamp);
      tVal.textContent = `${item.temperature.toFixed(1)} °C · ${item.humidity.toFixed(1)}% RH`;
      tooltip.classList.remove("is-hidden");
    });

    svg.addEventListener("pointerleave", () => {
      hoverLine.classList.add("is-hidden");
      dotT.classList.add("is-hidden");
      dotH.classList.add("is-hidden");
      tooltip.classList.add("is-hidden");
    });
  }

  /* ========================================================================
     6. UI RENDERERS FOR ALL 8 SECTIONS
     ======================================================================== */
  const PAGE_META = {
    overview: { breadcrumb: "Overview", title: "Farm Overview Dashboard" },
    live: { breadcrumb: "Live Monitoring", title: "Live Environment Monitoring" },
    rooms: { breadcrumb: "Growing Rooms", title: "Growing Room Management" },
    batches: { breadcrumb: "Cultivation Batches", title: "Cultivation Batch Management" },
    analytics: { breadcrumb: "Environmental Analytics", title: "Environmental Analytics & Reports" },
    alerts: { breadcrumb: "Alert Management", title: "Environmental Alert Management" },
    devices: { breadcrumb: "Device Management", title: "ESP32 Device Management" },
    settings: { breadcrumb: "Settings", title: "System & Threshold Settings" }
  };

  function renderAll() {
    renderGlobalChrome();
    if (state.activePage === "overview") renderOverviewPage();
    if (state.activePage === "live") renderLivePage();
    if (state.activePage === "rooms") renderRoomsPage();
    if (state.activePage === "batches") renderBatchesPage();
    if (state.activePage === "analytics") renderAnalyticsPage();
    if (state.activePage === "alerts") renderAlertsPage();
    if (state.activePage === "devices") renderDevicesPage();
    if (state.activePage === "settings") renderSettingsPage();
  }

  function renderGlobalChrome() {
    const activeAlerts = state.alerts.filter((a) => !a.resolved).length;
    document.getElementById("nav-alert-count").textContent = String(activeAlerts);

    const intervalSec = Math.round(state.prefs.pollIntervalMs / 1000);
    const labelEl = document.getElementById("next-update-label");
    labelEl.textContent = state.isStreaming ? `Simulated · ${state.countdownSec}s` : "Feed paused";

    document.getElementById("sidebar-adapter-label").textContent =
      `DemoSensorProvider · ${intervalSec}s cycle`;

    const toggleBtn = document.getElementById("toggle-stream-btn");
    toggleBtn.textContent = state.isStreaming ? "Pause Feed" : "Resume Feed";
    toggleBtn.classList.toggle("is-paused", !state.isStreaming);
  }

  /* ---------- 1. OVERVIEW DASHBOARD ---------- */
  function renderOverviewPage() {
    const t = state.thresholds;
    const focusRoom = state.rooms.find((r) => r.id === state.selectedRoomId) || state.rooms[0];
    const focusHistory = state.roomReadings[focusRoom.id] || [];
    const latest = focusHistory[focusHistory.length - 1];
    const prev = focusHistory[focusHistory.length - 2] || latest;

    // Farm-wide counts
    const latestPerRoom = state.rooms.map((r) => {
      const hist = state.roomReadings[r.id];
      return hist[hist.length - 1];
    });
    const connectedCount = latestPerRoom.filter((r) => r && r.connected).length;
    const activeAlerts = state.alerts.filter((a) => !a.resolved);
    const hasCrit = activeAlerts.some((a) => a.severity === "Critical") || connectedCount < state.rooms.length;
    const hasWarn = activeAlerts.some((a) => a.severity === "Warning");

    document.getElementById("ov-total-rooms").textContent = String(state.rooms.length);
    document.getElementById("ov-connected-devices").textContent = `${connectedCount} / ${state.rooms.length}`;
    setStatusIndicator(
      "ov-device-status",
      connectedCount === state.rooms.length ? "optimal" : "critical",
      connectedCount === state.rooms.length ? "Online" : "Degraded"
    );

    document.getElementById("ov-active-alerts").textContent = String(activeAlerts.length);
    setStatusIndicator(
      "ov-alert-severity-tag",
      hasCrit ? "critical" : hasWarn ? "warning" : "optimal",
      hasCrit ? "Critical" : hasWarn ? "Warning" : "Normal"
    );
    document.getElementById("ov-alerts-footnote").textContent =
      activeAlerts.length === 0 ? "All thresholds nominal" : `${activeAlerts.length} alert(s) require attention`;

    // Overall Health
    const healthPanel = document.getElementById("ov-health-panel");
    const healthLabel = document.getElementById("ov-health-label");
    const healthScore = document.getElementById("ov-health-score");
    healthPanel.classList.remove("is-warning", "is-critical");
    healthLabel.classList.remove("is-optimal-text", "is-warning-text", "is-critical-text");

    if (hasCrit) {
      healthPanel.classList.add("is-critical");
      healthLabel.classList.add("is-critical-text");
      healthLabel.textContent = "Critical";
      healthScore.textContent = "64%";
      document.getElementById("ov-health-footnote").textContent = "Critical fault or threshold breach";
    } else if (hasWarn) {
      healthPanel.classList.add("is-warning");
      healthLabel.classList.add("is-warning-text");
      healthLabel.textContent = "Attention";
      healthScore.textContent = "84%";
      document.getElementById("ov-health-footnote").textContent = "Minor environmental drift detected";
    } else {
      healthLabel.classList.add("is-optimal-text");
      healthLabel.textContent = "Optimal";
      healthScore.textContent = "98%";
      document.getElementById("ov-health-footnote").textContent = "Within cultivation targets";
    }

    // Focus Room Cards
    document.getElementById("ov-focus-room-heading").textContent =
      `Room Telemetry: ${focusRoom.id} ${focusRoom.name} (${focusRoom.variety.split(" (")[0]})`;
    if (latest) {
      document.getElementById("ov-last-updated").textContent = formatTime(latest.timestamp);
      const ev = evaluateReading(latest, t);

      document.getElementById("ov-temp-val").textContent =
        latest.temperature !== null ? latest.temperature.toFixed(1) : "--.-";
      setStatusIndicator("ov-temp-status", ev.tempClass, ev.tempStatus);
      document.getElementById("ov-temp-target").textContent = `Target: ${t.tempMin.toFixed(1)} – ${t.tempMax.toFixed(1)} °C`;
      const tDelta = latest.temperature !== null && prev.temperature !== null ? latest.temperature - prev.temperature : 0;
      document.getElementById("ov-temp-delta").textContent = `Δ ${tDelta >= 0 ? "+" : ""}${tDelta.toFixed(1)} °C`;
      updateRangeBar("ov-temp-zone", "ov-temp-marker", latest.temperature ?? t.tempMin, 10, 34, t.tempMin, t.tempMax, ev.tempClass);

      document.getElementById("ov-hum-val").textContent =
        latest.humidity !== null ? latest.humidity.toFixed(1) : "--.-";
      setStatusIndicator("ov-hum-status", ev.humClass, ev.humStatus);
      document.getElementById("ov-hum-target").textContent = `Target: ${t.humMin} – ${t.humMax} %`;
      const hDelta = latest.humidity !== null && prev.humidity !== null ? latest.humidity - prev.humidity : 0;
      document.getElementById("ov-hum-delta").textContent = `Δ ${hDelta >= 0 ? "+" : ""}${hDelta.toFixed(1)} %`;
      updateRangeBar("ov-hum-zone", "ov-hum-marker", latest.humidity ?? t.humMin, 50, 100, t.humMin, t.humMax, ev.humClass);

      document.getElementById("ov-co2-val").textContent = latest.co2 !== null ? String(latest.co2) : "---";
      setStatusIndicator("ov-co2-status", ev.co2Class, ev.co2Status);
      document.getElementById("ov-co2-target").textContent = `Target: < ${t.co2Warn} ppm`;
      const cDelta = latest.co2 !== null && prev.co2 !== null ? latest.co2 - prev.co2 : 0;
      document.getElementById("ov-co2-delta").textContent = `Δ ${cDelta >= 0 ? "+" : ""}${cDelta} ppm`;
      updateRangeBar("ov-co2-zone", "ov-co2-marker", latest.co2 ?? 400, 350, 1600, 350, t.co2Warn, ev.co2Class);
    }

    // Trend Chart
    renderDualOverviewChart(document.getElementById("ov-trend-chart"), focusHistory.slice(-15));

    // Daily Summary
    document.getElementById("ov-summary-room-label").textContent = `24-hour simulated range for ${focusRoom.id}`;
    const validT = focusHistory.map((r) => r.temperature).filter((v) => v !== null);
    const validH = focusHistory.map((r) => r.humidity).filter((v) => v !== null);
    const validC = focusHistory.map((r) => r.co2).filter((v) => v !== null);

    const summaryRows = [
      ["Avg Temperature", validT.length ? `${average(validT).toFixed(1)} °C` : "--"],
      ["Temp Min / Max", validT.length ? `${Math.min(...validT).toFixed(1)} / ${Math.max(...validT).toFixed(1)} °C` : "--"],
      ["Avg Relative Humidity", validH.length ? `${average(validH).toFixed(1)} %RH` : "--"],
      ["Avg CO₂ Concentration", validC.length ? `${Math.round(average(validC))} ppm` : "--"],
      ["Assigned Batch", focusRoom.batchId]
    ];
    document.getElementById("ov-daily-summary-list").innerHTML = summaryRows
      .map(([k, v]) => `<div class="kv-row"><dt>${k}</dt><dd class="mono-num">${v}</dd></div>`)
      .join("");

    // Recent Readings Table
    document.getElementById("ov-recent-readings-body").innerHTML = state.recentGlobalReadings
      .slice(0, 8)
      .map((r) => {
        const ev = evaluateReading(r, t);
        return `
          <tr>
            <td class="mono-num">${formatTime(r.timestamp)}</td>
            <td><strong>${r.roomId}</strong></td>
            <td class="num-col">${r.temperature !== null ? r.temperature.toFixed(1) + " °C" : "Fault"}</td>
            <td class="num-col">${r.humidity !== null ? r.humidity.toFixed(1) + " %" : "Fault"}</td>
            <td class="num-col">${r.co2 !== null ? r.co2 + " ppm" : "Offline"}</td>
            <td><span class="status-text-indicator is-${ev.overallClass}">${ev.overall}</span></td>
          </tr>
        `;
      })
      .join("");
  }

  /* ---------- 2. LIVE ENVIRONMENT MONITORING ---------- */
  function renderLivePage() {
    const room = state.rooms.find((r) => r.id === state.selectedRoomId) || state.rooms[0];
    const t = state.thresholds;
    const history = (state.roomReadings[room.id] || []).slice(-state.liveWindow);
    const latest = history[history.length - 1];
    const scenario = DemoSensorProvider.getScenario(room.id);

    // Sync scenario button active state
    document.querySelectorAll("[data-scenario]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.scenario === scenario);
    });

    document.getElementById("live-device-name").textContent = `${room.deviceId} · ${room.id} ${room.name}`;
    const badge = document.getElementById("live-device-badge");
    const isConn = latest && latest.connected;
    badge.className = `status-text-indicator is-${isConn ? "optimal" : "critical"}`;
    badge.innerHTML = `<span class="live-dot ${isConn ? "" : "is-offline"}" aria-hidden="true"></span> ${
      isConn ? "Connected (Demo)" : "Disconnected"
    }`;
    document.getElementById("live-last-timestamp").textContent = latest ? formatTime(latest.timestamp) : "--:--:--";
    document.getElementById("live-scenario-note").textContent = `Scenario: ${scenario.replace("_", " ")}`;

    // Sync target inputs
    document.getElementById("live-target-tmin").value = t.tempMin;
    document.getElementById("live-target-tmax").value = t.tempMax;
    document.getElementById("live-target-hmin").value = t.humMin;
    document.getElementById("live-target-hmax").value = t.humMax;
    document.getElementById("live-target-co2max").value = t.co2Warn;

    const validT = history.map((r) => r.temperature).filter((v) => v !== null);
    const validH = history.map((r) => r.humidity).filter((v) => v !== null);
    const validC = history.map((r) => r.co2).filter((v) => v !== null);

    document.getElementById("live-temp-now").textContent =
      latest && latest.temperature !== null ? `${latest.temperature.toFixed(1)} °C` : "Fault / Offline";
    document.getElementById("live-temp-min").textContent = validT.length ? Math.min(...validT).toFixed(1) : "--";
    document.getElementById("live-temp-max").textContent = validT.length ? Math.max(...validT).toFixed(1) : "--";

    document.getElementById("live-hum-now").textContent =
      latest && latest.humidity !== null ? `${latest.humidity.toFixed(1)} %` : "Fault / Offline";
    document.getElementById("live-hum-min").textContent = validH.length ? Math.min(...validH).toFixed(1) : "--";
    document.getElementById("live-hum-max").textContent = validH.length ? Math.max(...validH).toFixed(1) : "--";

    document.getElementById("live-co2-now").textContent =
      latest && latest.co2 !== null ? `${latest.co2} ppm` : "Offline";
    document.getElementById("live-co2-min").textContent = validC.length ? String(Math.min(...validC)) : "---";
    document.getElementById("live-co2-max").textContent = validC.length ? String(Math.max(...validC)) : "---";

    renderLineChart(document.getElementById("chart-live-temp"), {
      data: history,
      accessor: (d) => d.temperature,
      baselineAccessor: state.showBaselineComparison
        ? (_d, i) => room.baselineTemp + Math.sin(i * 0.35) * 0.4
        : null,
      yMin: 10,
      yMax: 34,
      optMin: t.tempMin,
      optMax: t.tempMax,
      warnLine: t.tempMax,
      formatAxis: (v) => v.toFixed(0) + "°",
      formatX: (d) => formatTime(d.timestamp),
      formatTooltip: (_d, v) => `${v.toFixed(1)} °C (Baseline: ${room.baselineTemp.toFixed(1)} °C)`,
      ariaLabel: "Live room temperature chart"
    });

    renderLineChart(document.getElementById("chart-live-hum"), {
      data: history,
      accessor: (d) => d.humidity,
      baselineAccessor: state.showBaselineComparison
        ? (_d, i) => room.baselineHum + Math.cos(i * 0.3) * 1.1
        : null,
      yMin: 45,
      yMax: 100,
      optMin: t.humMin,
      optMax: t.humMax,
      warnLine: t.humMin,
      formatAxis: (v) => v.toFixed(0) + "%",
      formatX: (d) => formatTime(d.timestamp),
      formatTooltip: (_d, v) => `${v.toFixed(1)} %RH (Baseline: ${room.baselineHum.toFixed(1)}%)`,
      ariaLabel: "Live room relative humidity chart"
    });

    renderLineChart(document.getElementById("chart-live-co2"), {
      data: history,
      accessor: (d) => d.co2,
      baselineAccessor: state.showBaselineComparison
        ? (_d, i) => room.baselineCo2 + Math.sin(i * 0.4) * 35
        : null,
      yMin: 350,
      yMax: 1700,
      optMin: 350,
      optMax: t.co2Warn,
      warnLine: t.co2Warn,
      formatAxis: (v) => String(Math.round(v)),
      formatX: (d) => formatTime(d.timestamp),
      formatTooltip: (_d, v) => `${Math.round(v)} ppm (Baseline: ${room.baselineCo2} ppm)`,
      ariaLabel: "Live room CO2 concentration chart"
    });
  }

  /* ---------- 3. GROWING ROOM MANAGEMENT ---------- */
  function renderRoomsPage() {
    const t = state.thresholds;
    const q = state.filters.roomsQuery.trim().toLowerCase();
    const statusFilter = state.filters.roomsStatus;

    const cardsData = state.rooms
      .map((room) => {
        const hist = state.roomReadings[room.id] || [];
        const latest = hist[hist.length - 1];
        const ev = evaluateReading(latest, t);
        const batch = state.batches.find((b) => b.id === room.batchId);
        return { room, latest, ev, batch };
      })
      .filter(({ room, ev }) => {
        if (statusFilter !== "all" && ev.overallClass !== (statusFilter === "normal" ? "optimal" : statusFilter)) {
          return false;
        }
        if (!q) return true;
        return `${room.id} ${room.name} ${room.variety} ${room.batchId}`.toLowerCase().includes(q);
      });

    document.getElementById("rooms-count-label").textContent = `${cardsData.length} of ${state.rooms.length} rooms`;

    const gridEl = document.getElementById("rooms-cards-grid");
    const emptyEl = document.getElementById("rooms-empty-state");

    if (!cardsData.length) {
      gridEl.innerHTML = "";
      emptyEl.classList.remove("is-hidden");
      return;
    }

    emptyEl.classList.add("is-hidden");
    gridEl.innerHTML = cardsData
      .map(({ room, latest, ev, batch }) => {
        const utilPct = Math.round((room.capacityUsed / room.capacityMax) * 100);
        return `
          <article class="panel room-card">
            <div class="panel-header-row compact-row">
              <div>
                <span class="eyebrow-label">${room.id} · ${escapeHtml(room.deviceId)}</span>
                <h2 class="panel-title-sm">${escapeHtml(room.name)}</h2>
                <p class="panel-subtitle">${escapeHtml(room.variety)}</p>
              </div>
              <span class="status-text-indicator is-${ev.overallClass}">${ev.overall}</span>
            </div>

            <div class="room-card-metrics">
              <div class="room-metric-cell">
                <span>Temperature</span>
                <strong>${latest && latest.temperature !== null ? latest.temperature.toFixed(1) + " °C" : "Fault"}</strong>
              </div>
              <div class="room-metric-cell">
                <span>Humidity</span>
                <strong>${latest && latest.humidity !== null ? latest.humidity.toFixed(1) + " %" : "Fault"}</strong>
              </div>
              <div class="room-metric-cell">
                <span>CO₂</span>
                <strong>${latest && latest.co2 !== null ? latest.co2 + " ppm" : "Offline"}</strong>
              </div>
            </div>

            <dl class="compact-kv-list">
              <div class="kv-row">
                <dt>Room Capacity</dt>
                <dd class="mono-num">${room.capacityUsed} / ${room.capacityMax} blocks (${utilPct}%)</dd>
              </div>
              <div class="kv-row">
                <dt>Cultivation Batch</dt>
                <dd class="mono-num">${escapeHtml(room.batchId)} · ${batch ? escapeHtml(batch.stage) : "Active"}</dd>
              </div>
            </dl>

            <div class="room-card-footer">
              <span>Last sample: <span class="mono-num">${latest ? formatTime(latest.timestamp) : "--"}</span></span>
              <button type="button" class="btn btn-secondary btn-sm" data-inspect-room="${room.id}">
                Inspect Live
              </button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  /* ---------- 4. CULTIVATION BATCH MANAGEMENT ---------- */
  function renderBatchesPage() {
    const q = state.filters.batchesQuery.trim().toLowerCase();
    const stageFilter = state.filters.batchesStage;

    const filtered = state.batches.filter((b) => {
      if (stageFilter !== "all" && b.stage !== stageFilter) return false;
      if (!q) return true;
      return `${b.id} ${b.species} ${b.roomId} ${b.stage} ${b.notes}`.toLowerCase().includes(q);
    });

    const tbody = document.getElementById("batches-table-body");
    const emptyEl = document.getElementById("batches-empty-state");

    if (!filtered.length) {
      tbody.innerHTML = "";
      emptyEl.classList.remove("is-hidden");
      return;
    }

    emptyEl.classList.add("is-hidden");
    tbody.innerHTML = filtered
      .map((b) => {
        const statusClass =
          b.status === "Harvest Ready" ? "optimal" : b.status === "Monitoring" ? "warning" : "optimal";
        return `
          <tr>
            <td class="mono-num"><strong>${escapeHtml(b.id)}</strong></td>
            <td>${escapeHtml(b.species)}</td>
            <td class="mono-num">${escapeHtml(b.roomId)}</td>
            <td class="mono-num">${escapeHtml(b.prepDate)}</td>
            <td class="mono-num">${escapeHtml(b.inocDate)}</td>
            <td>
              <select class="room-select" style="height:30px;font-size:12px;" data-batch-stage="${escapeHtml(b.id)}" aria-label="Growth stage for ${escapeHtml(b.id)}">
                ${["Incubation", "Pinning", "Fruiting", "Harvest Ready", "Completed"]
                  .map((st) => `<option value="${st}" ${b.stage === st ? "selected" : ""}>${st}</option>`)
                  .join("")}
              </select>
            </td>
            <td class="mono-num">${escapeHtml(b.harvestDate)}</td>
            <td><span class="status-text-indicator is-${statusClass}">${escapeHtml(b.status)}</span></td>
            <td class="notes-cell">${escapeHtml(b.notes)}</td>
          </tr>
        `;
      })
      .join("");
  }

  /* ---------- 5. ENVIRONMENTAL ANALYTICS ---------- */
  function getFilteredAnalyticsRecords() {
    const { anDateStart, anDateEnd, anRoomId, anTableQuery } = state.filters;
    const q = anTableQuery.trim().toLowerCase();

    return state.analyticsDaily.filter((rec) => {
      if (anRoomId !== "ALL" && rec.roomId !== anRoomId) return false;
      if (anDateStart && rec.date < anDateStart) return false;
      if (anDateEnd && rec.date > anDateEnd) return false;
      if (q && !`${rec.date} ${rec.roomId} ${rec.roomName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderAnalyticsPage() {
    const records = getFilteredAnalyticsRecords();
    const t = state.thresholds;

    // Aggregate by date across filtered rooms for charts
    const byDateMap = new Map();
    records.forEach((r) => {
      if (!byDateMap.has(r.date)) {
        byDateMap.set(r.date, []);
      }
      byDateMap.get(r.date).push(r);
    });

    const dailySeries = Array.from(byDateMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, list]) => ({
        date,
        avgTemp: round1(average(list.map((x) => x.avgTemp))),
        minTemp: round1(Math.min(...list.map((x) => x.minTemp))),
        maxTemp: round1(Math.max(...list.map((x) => x.maxTemp))),
        avgHum: round1(average(list.map((x) => x.avgHum))),
        avgCo2: Math.round(average(list.map((x) => x.avgCo2))),
        stability: Math.round(average(list.map((x) => x.stability)))
      }));

    document.getElementById("an-days-count").textContent = `${dailySeries.length} day(s) · ${records.length} logs`;

    if (records.length) {
      const temps = records.map((r) => r.avgTemp);
      const hums = records.map((r) => r.avgHum);
      const co2s = records.map((r) => r.avgCo2);
      const stabs = records.map((r) => r.stability);

      document.getElementById("an-temp-summary").textContent =
        `${Math.min(...records.map((r) => r.minTemp)).toFixed(1)} / ${average(temps).toFixed(1)} / ${Math.max(...records.map((r) => r.maxTemp)).toFixed(1)} °C`;
      document.getElementById("an-hum-summary").textContent =
        `${Math.min(...hums).toFixed(1)} / ${average(hums).toFixed(1)} / ${Math.max(...hums).toFixed(1)} %`;
      document.getElementById("an-co2-summary").textContent =
        `${Math.min(...co2s)} / ${Math.round(average(co2s))} / ${Math.max(...co2s)} ppm`;
      document.getElementById("an-stability-score").textContent = `${Math.round(average(stabs))}%`;
    } else {
      document.getElementById("an-temp-summary").textContent = "-- / -- / -- °C";
      document.getElementById("an-hum-summary").textContent = "-- / -- / -- %";
      document.getElementById("an-co2-summary").textContent = "-- / -- / -- ppm";
      document.getElementById("an-stability-score").textContent = "--%";
    }

    renderLineChart(document.getElementById("chart-an-temp"), {
      data: dailySeries,
      accessor: (d) => d.avgTemp,
      minAccessor: (d) => d.minTemp,
      maxAccessor: (d) => d.maxTemp,
      yMin: 12,
      yMax: 30,
      optMin: t.tempMin,
      optMax: t.tempMax,
      formatAxis: (v) => v.toFixed(0) + "°",
      formatX: (d) => d.date.slice(5),
      formatXTooltip: (d) => d.date,
      formatTooltip: (d) => `Avg ${d.avgTemp.toFixed(1)} °C (${d.minTemp}–${d.maxTemp} °C)`,
      ariaLabel: "Daily temperature trends chart"
    });

    renderLineChart(document.getElementById("chart-an-hum"), {
      data: dailySeries,
      accessor: (d) => d.avgHum,
      yMin: 55,
      yMax: 100,
      optMin: t.humMin,
      optMax: t.humMax,
      formatAxis: (v) => v.toFixed(0) + "%",
      formatX: (d) => d.date.slice(5),
      formatXTooltip: (d) => d.date,
      formatTooltip: (d) => `Avg ${d.avgHum.toFixed(1)} %RH`,
      ariaLabel: "Weekly humidity trends chart"
    });

    renderLineChart(document.getElementById("chart-an-co2"), {
      data: dailySeries,
      accessor: (d) => d.avgCo2,
      yMin: 350,
      yMax: 1450,
      optMin: 350,
      optMax: t.co2Warn,
      warnLine: t.co2Warn,
      formatAxis: (v) => String(Math.round(v)),
      formatX: (d) => d.date.slice(5),
      formatXTooltip: (d) => d.date,
      formatTooltip: (d) => `Avg ${d.avgCo2} ppm CO₂`,
      ariaLabel: "CO2 concentration history chart"
    });

    const tbody = document.getElementById("an-table-body");
    const emptyEl = document.getElementById("an-empty-state");
    if (!records.length) {
      tbody.innerHTML = "";
      emptyEl.classList.remove("is-hidden");
    } else {
      emptyEl.classList.add("is-hidden");
      tbody.innerHTML = records
        .slice()
        .reverse()
        .slice(0, 60)
        .map(
          (r) => `
          <tr>
            <td class="mono-num">${r.date}</td>
            <td><strong>${r.roomId}</strong> · ${escapeHtml(r.roomName)}</td>
            <td class="num-col">${r.avgTemp.toFixed(1)} °C</td>
            <td class="num-col">${r.minTemp.toFixed(1)} / ${r.maxTemp.toFixed(1)} °C</td>
            <td class="num-col">${r.avgHum.toFixed(1)} %</td>
            <td class="num-col">${r.avgCo2} ppm</td>
            <td class="num-col"><span class="status-text-indicator is-${r.stability >= 80 ? "optimal" : "warning"}">${r.stability}%</span></td>
          </tr>
        `
        )
        .join("");
    }
  }

  function exportAnalyticsCsv() {
    const records = getFilteredAnalyticsRecords();
    const header = ["Date", "Room_ID", "Room_Name", "Avg_Temp_C", "Min_Temp_C", "Max_Temp_C", "Avg_Humidity_Pct", "Avg_CO2_ppm", "Stability_Pct"];
    const rows = [header.join(",")];
    records.forEach((r) => {
      rows.push([r.date, r.roomId, `"${r.roomName}"`, r.avgTemp, r.minTemp, r.maxTemp, r.avgHum, r.avgCo2, r.stability].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mycomonitor_analytics_${state.filters.anDateStart || "all"}_to_${state.filters.anDateEnd || "now"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ---------- 6. ALERT MANAGEMENT ---------- */
  function renderAlertsPage() {
    const active = state.alerts.filter((a) => !a.resolved);
    const crit = active.filter((a) => a.severity === "Critical").length;
    const warn = active.filter((a) => a.severity === "Warning").length;
    const normalCount = state.alerts.filter((a) => a.resolved || a.severity === "Normal").length;

    document.getElementById("al-active-count").textContent = String(active.length);
    document.getElementById("al-critical-count").textContent = String(crit);
    document.getElementById("al-warning-count").textContent = String(warn);
    document.getElementById("al-normal-count").textContent = String(normalCount);

    const q = state.filters.alertsQuery.trim().toLowerCase();
    const sevFilter = state.filters.alertsSeverity;

    const filtered = state.alerts.filter((a) => {
      const displaySev = a.resolved ? "Normal" : a.severity;
      if (sevFilter !== "all" && displaySev !== sevFilter) return false;
      if (!q) return true;
      return `${a.title} ${a.message} ${a.roomId} ${a.type}`.toLowerCase().includes(q);
    });

    const feed = document.getElementById("alerts-feed");
    const empty = document.getElementById("alerts-empty-state");

    if (!filtered.length) {
      feed.innerHTML = "";
      empty.classList.remove("is-hidden");
      return;
    }

    empty.classList.add("is-hidden");
    feed.innerHTML = filtered
      .map((a) => {
        const displaySev = a.resolved ? "Normal" : a.severity;
        const sevClass = displaySev === "Critical" ? "critical" : displaySev === "Warning" ? "warning" : "optimal";
        return `
          <li class="alert-row ${a.resolved ? "is-resolved" : ""}">
            <div class="alert-row-main">
              <div class="alert-row-header">
                <span class="status-text-indicator is-${sevClass}">${displaySev}</span>
                <span class="alert-row-title">${escapeHtml(a.title)}</span>
              </div>
              <p class="alert-row-message">${escapeHtml(a.message)}</p>
              <div class="alert-row-meta">
                <span class="mono-num">${formatDate(a.timestamp)} ${formatTime(a.timestamp)}</span>
                <span aria-hidden="true">·</span>
                <span>Type: ${escapeHtml(a.type)}</span>
                <span aria-hidden="true">·</span>
                <span>Action: ${escapeHtml(a.action)}</span>
              </div>
            </div>
            <div>
              ${
                a.resolved
                  ? `<span class="status-text-indicator is-optimal">Resolved</span>`
                  : `<button type="button" class="btn btn-secondary btn-sm" data-resolve-alert="${a.id}">Resolve</button>`
              }
            </div>
          </li>
        `;
      })
      .join("");
  }

  /* ---------- 7. DEVICE MANAGEMENT ---------- */
  function renderDevicesPage() {
    const q = state.filters.devicesQuery.trim().toLowerCase();
    const statusFilter = state.filters.devicesStatus;

    const list = state.devices
      .map((dev) => {
        const hist = state.roomReadings[dev.roomId] || [];
        const latest = hist[hist.length - 1];
        let connLabel = "Connected";
        let connClass = "optimal";
        if (!latest || !latest.connected || dev.forcedOffline) {
          connLabel = "Disconnected";
          connClass = "critical";
        } else if (!latest.sensorOk || dev.forcedSensorFault) {
          connLabel = "Sensor Fault";
          connClass = "warning";
        }
        return { dev, latest, connLabel, connClass };
      })
      .filter(({ dev, connLabel }) => {
        if (statusFilter !== "all" && connLabel !== statusFilter) return false;
        if (!q) return true;
        return `${dev.deviceId} ${dev.location} ${dev.sensors} ${dev.ip}`.toLowerCase().includes(q);
      });

    document.getElementById("devices-cards-grid").innerHTML = list
      .map(
        ({ dev, latest, connLabel, connClass }) => `
        <article class="panel room-card">
          <div class="panel-header-row compact-row">
            <div>
              <span class="eyebrow-label">${escapeHtml(dev.deviceId)} · MAC ${escapeHtml(dev.mac)}</span>
              <h2 class="panel-title-sm">${escapeHtml(dev.location)}</h2>
            </div>
            <span class="status-text-indicator is-${connClass}">
              <span class="live-dot ${connClass === "critical" ? "is-offline" : ""}" aria-hidden="true"></span>
              ${connLabel} (Demo)
            </span>
          </div>

          <dl class="compact-kv-list">
            <div class="kv-row">
              <dt>Sensors Attached</dt>
              <dd>${escapeHtml(dev.sensors)}</dd>
            </div>
            <div class="kv-row">
              <dt>Last Communication</dt>
              <dd class="mono-num">${latest ? formatDate(latest.timestamp) + " " + formatTime(latest.timestamp) : "--"}</dd>
            </div>
            <div class="kv-row">
              <dt>Network &amp; Firmware</dt>
              <dd class="mono-num">${escapeHtml(dev.ip)} · ${escapeHtml(dev.firmware)} · ${latest && latest.rssi ? latest.rssi + " dBm" : "No Signal"}</dd>
            </div>
          </dl>

          <div class="room-card-footer">
            <button type="button" class="btn btn-secondary btn-sm" data-toggle-offline="${dev.deviceId}">
              ${dev.forcedOffline ? "Reconnect Node" : "Simulate Disconnect"}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-toggle-fault="${dev.deviceId}">
              ${dev.forcedSensorFault ? "Clear Sensor Fault" : "Simulate Sensor Fault"}
            </button>
          </div>
        </article>
      `
      )
      .join("");

    const sample = (state.roomReadings[state.selectedRoomId] || []).slice(-1)[0];
    document.getElementById("dev-json-preview").textContent = JSON.stringify(
      sample || { deviceId: "ESP32-RM01", mode: SensorConfig.mode },
      null,
      2
    );
  }

  /* ---------- 8. SETTINGS ---------- */
  function renderSettingsPage() {
    const t = state.thresholds;
    document.getElementById("set-temp-min").value = t.tempMin;
    document.getElementById("set-temp-max").value = t.tempMax;
    document.getElementById("set-hum-min").value = t.humMin;
    document.getElementById("set-hum-max").value = t.humMax;
    document.getElementById("set-co2-warn").value = t.co2Warn;
    document.getElementById("set-co2-crit").value = t.co2Crit;

    document.getElementById("pref-temp-alerts").checked = state.prefs.tempAlerts;
    document.getElementById("pref-hum-alerts").checked = state.prefs.humAlerts;
    document.getElementById("pref-co2-alerts").checked = state.prefs.co2Alerts;
    document.getElementById("pref-device-alerts").checked = state.prefs.deviceAlerts;
    document.getElementById("pref-poll-interval").value = String(state.prefs.pollIntervalMs);
    document.getElementById("pref-default-room").value = state.prefs.defaultRoomId;
  }

  /* ========================================================================
     7. POLLING LOOP & EVENT BINDING
     ======================================================================== */
  let pollTimerId = null;

  async function runSampleCycle() {
    const readings = await SensorDataAdapter.pollAllRooms(state.rooms, state.thresholds);
    readings.forEach((reading) => {
      const arr = state.roomReadings[reading.roomId];
      arr.push(reading);
      if (arr.length > 100) arr.shift();

      state.recentGlobalReadings.unshift(reading);
      const ev = evaluateReading(reading, state.thresholds);
      processAlerts(reading, ev);
    });
    if (state.recentGlobalReadings.length > 60) {
      state.recentGlobalReadings.length = 60;
    }

    state.countdownSec = Math.round(state.prefs.pollIntervalMs / 1000);
    renderAll();
  }

  function startStreamLoop() {
    if (pollTimerId) clearInterval(pollTimerId);
    state.countdownSec = Math.round(state.prefs.pollIntervalMs / 1000);

    pollTimerId = setInterval(() => {
      if (!state.isStreaming) return;
      state.countdownSec -= 1;
      if (state.countdownSec <= 0) {
        runSampleCycle();
      } else {
        document.getElementById("next-update-label").textContent = `Simulated · ${state.countdownSec}s`;
      }
    }, 1000);
  }

  function switchPage(pageId) {
    if (!PAGE_META[pageId]) return;
    state.activePage = pageId;

    document.querySelectorAll(".nav-item").forEach((btn) => {
      const match = btn.dataset.page === pageId;
      btn.classList.toggle("is-active", match);
      if (match) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    document.querySelectorAll(".page-view").forEach((sec) => {
      sec.classList.toggle("is-active", sec.id === "page-" + pageId);
    });

    document.getElementById("topbar-section-name").textContent = PAGE_META[pageId].breadcrumb;
    document.getElementById("page-title").textContent = PAGE_META[pageId].title;

    closeMobileSidebar();
    renderAll();
  }

  function populateSelects() {
    const roomOptions = state.rooms
      .map((r) => `<option value="${r.id}">${r.id} — ${escapeHtml(r.name)}</option>`)
      .join("");

    document.getElementById("global-room-select").innerHTML = roomOptions;
    document.getElementById("global-room-select").value = state.selectedRoomId;
    document.getElementById("nb-room").innerHTML = roomOptions;
    document.getElementById("pref-default-room").innerHTML = roomOptions;
    document.getElementById("an-room-filter").innerHTML =
      `<option value="ALL">All Growing Rooms</option>` + roomOptions;
  }

  function openMobileSidebar() {
    document.getElementById("sidebar").classList.add("is-open");
    document.getElementById("sidebar-backdrop").classList.add("is-visible");
    document.getElementById("mobile-menu-btn").setAttribute("aria-expanded", "true");
  }

  function closeMobileSidebar() {
    document.getElementById("sidebar").classList.remove("is-open");
    document.getElementById("sidebar-backdrop").classList.remove("is-visible");
    document.getElementById("mobile-menu-btn").setAttribute("aria-expanded", "false");
  }

  function bindEvents() {
    // Navigation
    document.querySelectorAll(".nav-item[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => switchPage(btn.dataset.page));
    });
    document.querySelectorAll("[data-jump-page]").forEach((btn) => {
      btn.addEventListener("click", () => switchPage(btn.dataset.jumpPage));
    });

    // Mobile drawer
    document.getElementById("mobile-menu-btn").addEventListener("click", openMobileSidebar);
    document.getElementById("sidebar-close-btn").addEventListener("click", closeMobileSidebar);
    document.getElementById("sidebar-backdrop").addEventListener("click", closeMobileSidebar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMobileSidebar();
    });

    // Global room switch, refresh & pause/resume
    document.getElementById("global-room-select").addEventListener("change", (e) => {
      state.selectedRoomId = e.target.value;
      renderAll();
    });
    document.getElementById("global-refresh-btn").addEventListener("click", () => runSampleCycle());
    document.getElementById("toggle-stream-btn").addEventListener("click", () => {
      state.isStreaming = !state.isStreaming;
      if (state.isStreaming) state.countdownSec = Math.round(state.prefs.pollIntervalMs / 1000);
      renderGlobalChrome();
    });

    // Live Monitoring controls
    document.querySelectorAll("[data-scenario]").forEach((btn) => {
      btn.addEventListener("click", () => {
        DemoSensorProvider.setScenario(state.selectedRoomId, btn.dataset.scenario);
        runSampleCycle();
      });
    });

    document.querySelectorAll("[data-window]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-window]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.liveWindow = Number(btn.dataset.window);
        renderLivePage();
      });
    });

    document.getElementById("live-compare-toggle").addEventListener("change", (e) => {
      state.showBaselineComparison = e.target.checked;
      renderLivePage();
    });

    document.getElementById("live-apply-targets-btn").addEventListener("click", () => {
      state.thresholds.tempMin = Number(document.getElementById("live-target-tmin").value);
      state.thresholds.tempMax = Number(document.getElementById("live-target-tmax").value);
      state.thresholds.humMin = Number(document.getElementById("live-target-hmin").value);
      state.thresholds.humMax = Number(document.getElementById("live-target-hmax").value);
      state.thresholds.co2Warn = Number(document.getElementById("live-target-co2max").value);
      saveStorage(STORAGE_KEYS.thresholds, state.thresholds);
      renderAll();
    });

    // Growing Rooms
    document.getElementById("rooms-search").addEventListener("input", (e) => {
      state.filters.roomsQuery = e.target.value;
      renderRoomsPage();
    });
    document.querySelectorAll("[data-room-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-room-filter]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.filters.roomsStatus = btn.dataset.roomFilter;
        renderRoomsPage();
      });
    });
    document.getElementById("reset-rooms-filter-btn").addEventListener("click", () => {
      state.filters.roomsQuery = "";
      state.filters.roomsStatus = "all";
      document.getElementById("rooms-search").value = "";
      document.querySelectorAll("[data-room-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.roomFilter === "all"));
      renderRoomsPage();
    });
    document.getElementById("rooms-cards-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-inspect-room]");
      if (!btn) return;
      state.selectedRoomId = btn.dataset.inspectRoom;
      document.getElementById("global-room-select").value = state.selectedRoomId;
      switchPage("live");
    });

    // Cultivation Batches
    document.getElementById("batches-search").addEventListener("input", (e) => {
      state.filters.batchesQuery = e.target.value;
      renderBatchesPage();
    });
    document.querySelectorAll("[data-batch-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-batch-filter]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.filters.batchesStage = btn.dataset.batchFilter;
        renderBatchesPage();
      });
    });
    document.getElementById("reset-batches-filter-btn").addEventListener("click", () => {
      state.filters.batchesQuery = "";
      state.filters.batchesStage = "all";
      document.getElementById("batches-search").value = "";
      document.querySelectorAll("[data-batch-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.batchFilter === "all"));
      renderBatchesPage();
    });
    document.getElementById("toggle-new-batch-btn").addEventListener("click", () => {
      document.getElementById("new-batch-form").classList.toggle("is-hidden");
    });
    document.getElementById("cancel-new-batch-btn").addEventListener("click", () => {
      document.getElementById("new-batch-form").classList.add("is-hidden");
    });
    document.getElementById("new-batch-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const stage = document.getElementById("nb-stage").value;
      const newBatch = {
        id: document.getElementById("nb-id").value.trim(),
        species: document.getElementById("nb-species").value.trim(),
        roomId: document.getElementById("nb-room").value,
        prepDate: document.getElementById("nb-prep-date").value,
        inocDate: document.getElementById("nb-inoc-date").value,
        stage,
        harvestDate: document.getElementById("nb-harvest-date").value,
        status: stage === "Harvest Ready" ? "Harvest Ready" : "Active",
        notes: document.getElementById("nb-notes").value.trim() || "Logged via MycoMonitor."
      };
      state.batches.unshift(newBatch);
      saveStorage(STORAGE_KEYS.batches, state.batches);
      e.target.reset();
      document.getElementById("new-batch-form").classList.add("is-hidden");
      renderBatchesPage();
    });
    document.getElementById("batches-table-body").addEventListener("change", (e) => {
      const sel = e.target.closest("[data-batch-stage]");
      if (!sel) return;
      const batch = state.batches.find((b) => b.id === sel.dataset.batchStage);
      if (batch) {
        batch.stage = sel.value;
        batch.status = sel.value === "Completed" ? "Completed" : sel.value === "Harvest Ready" ? "Harvest Ready" : "Active";
        saveStorage(STORAGE_KEYS.batches, state.batches);
        renderBatchesPage();
      }
    });

    // Analytics
    document.getElementById("an-date-start").addEventListener("change", (e) => {
      state.filters.anDateStart = e.target.value;
      renderAnalyticsPage();
    });
    document.getElementById("an-date-end").addEventListener("change", (e) => {
      state.filters.anDateEnd = e.target.value;
      renderAnalyticsPage();
    });
    document.querySelectorAll("[data-date-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-date-preset]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        applyAnalyticsPreset(Number(btn.dataset.datePreset));
        renderAnalyticsPage();
      });
    });
    document.getElementById("an-room-filter").addEventListener("change", (e) => {
      state.filters.anRoomId = e.target.value;
      renderAnalyticsPage();
    });
    document.getElementById("an-table-search").addEventListener("input", (e) => {
      state.filters.anTableQuery = e.target.value;
      renderAnalyticsPage();
    });
    document.getElementById("an-export-csv-btn").addEventListener("click", exportAnalyticsCsv);

    // Alerts
    document.getElementById("al-search").addEventListener("input", (e) => {
      state.filters.alertsQuery = e.target.value;
      renderAlertsPage();
    });
    document.querySelectorAll("[data-alert-severity]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-alert-severity]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.filters.alertsSeverity = btn.dataset.alertSeverity;
        renderAlertsPage();
      });
    });
    document.getElementById("alerts-feed").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-resolve-alert]");
      if (!btn) return;
      const target = state.alerts.find((a) => a.id === btn.dataset.resolveAlert);
      if (target) {
        target.resolved = true;
        renderAll();
      }
    });
    document.getElementById("al-resolve-all-btn").addEventListener("click", () => {
      state.alerts.forEach((a) => {
        a.resolved = true;
      });
      renderAll();
    });
    document.getElementById("al-clear-resolved-btn").addEventListener("click", () => {
      state.alerts = state.alerts.filter((a) => !a.resolved);
      renderAll();
    });

    // Device Management
    document.getElementById("dev-search").addEventListener("input", (e) => {
      state.filters.devicesQuery = e.target.value;
      renderDevicesPage();
    });
    document.querySelectorAll("[data-dev-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-dev-filter]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.filters.devicesStatus = btn.dataset.devFilter;
        renderDevicesPage();
      });
    });
    document.getElementById("dev-ping-all-btn").addEventListener("click", () => runSampleCycle());
    document.getElementById("devices-cards-grid").addEventListener("click", (e) => {
      const offBtn = e.target.closest("[data-toggle-offline]");
      if (offBtn) {
        const dev = state.devices.find((d) => d.deviceId === offBtn.dataset.toggleOffline);
        if (dev) {
          dev.forcedOffline = !dev.forcedOffline;
          runSampleCycle();
        }
        return;
      }
      const faultBtn = e.target.closest("[data-toggle-fault]");
      if (faultBtn) {
        const dev = state.devices.find((d) => d.deviceId === faultBtn.dataset.toggleFault);
        if (dev) {
          dev.forcedSensorFault = !dev.forcedSensorFault;
          runSampleCycle();
        }
      }
    });

    // Settings
    document.getElementById("settings-thresholds-form").addEventListener("submit", (e) => {
      e.preventDefault();
      state.thresholds = {
        tempMin: Number(document.getElementById("set-temp-min").value),
        tempMax: Number(document.getElementById("set-temp-max").value),
        humMin: Number(document.getElementById("set-hum-min").value),
        humMax: Number(document.getElementById("set-hum-max").value),
        co2Warn: Number(document.getElementById("set-co2-warn").value),
        co2Crit: Number(document.getElementById("set-co2-crit").value)
      };
      saveStorage(STORAGE_KEYS.thresholds, state.thresholds);
      document.getElementById("settings-thresh-msg").textContent = "Thresholds saved.";
      setTimeout(() => {
        document.getElementById("settings-thresh-msg").textContent = "";
      }, 2500);
      renderAll();
    });

    document.getElementById("reset-thresholds-btn").addEventListener("click", () => {
      state.thresholds = { ...DEFAULT_THRESHOLDS };
      saveStorage(STORAGE_KEYS.thresholds, state.thresholds);
      renderSettingsPage();
      document.getElementById("settings-thresh-msg").textContent = "Reset to default targets.";
      renderAll();
    });

    ["pref-temp-alerts", "pref-hum-alerts", "pref-co2-alerts", "pref-device-alerts"].forEach((id, idx) => {
      const keys = ["tempAlerts", "humAlerts", "co2Alerts", "deviceAlerts"];
      document.getElementById(id).addEventListener("change", (e) => {
        state.prefs[keys[idx]] = e.target.checked;
        saveStorage(STORAGE_KEYS.prefs, state.prefs);
      });
    });

    document.getElementById("pref-poll-interval").addEventListener("change", (e) => {
      state.prefs.pollIntervalMs = Number(e.target.value);
      SensorConfig.pollIntervalMs = state.prefs.pollIntervalMs;
      saveStorage(STORAGE_KEYS.prefs, state.prefs);
      startStreamLoop();
      renderGlobalChrome();
    });

    document.getElementById("pref-default-room").addEventListener("change", (e) => {
      state.prefs.defaultRoomId = e.target.value;
      saveStorage(STORAGE_KEYS.prefs, state.prefs);
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (["overview", "live", "analytics"].includes(state.activePage)) renderAll();
      }, 120);
    });
  }

  function applyAnalyticsPreset(days) {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    state.filters.anDateStart = formatDate(start.getTime());
    state.filters.anDateEnd = formatDate(end.getTime());
    document.getElementById("an-date-start").value = state.filters.anDateStart;
    document.getElementById("an-date-end").value = state.filters.anDateEnd;
  }

  /* ========================================================================
     8. HELPERS & BOOTSTRAP
     ======================================================================== */
  function setStatusIndicator(elId, severityClass, labelText) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.classList.remove("is-optimal", "is-warning", "is-critical");
    el.classList.add("is-" + severityClass);
    el.textContent = labelText;
  }

  function updateRangeBar(zoneId, markerId, value, minScale, maxScale, optMin, optMax, severity) {
    const span = maxScale - minScale || 1;
    const leftPct = clamp(((optMin - minScale) / span) * 100, 0, 100);
    const rightPct = clamp(((optMax - minScale) / span) * 100, 0, 100);
    const valPct = clamp(((value - minScale) / span) * 100, 2, 98);

    const zoneEl = document.getElementById(zoneId);
    const markerEl = document.getElementById(markerId);
    zoneEl.style.left = leftPct.toFixed(1) + "%";
    zoneEl.style.width = Math.max(4, rightPct - leftPct).toFixed(1) + "%";
    markerEl.style.left = valPct.toFixed(1) + "%";
    markerEl.classList.remove("is-warning", "is-critical");
    if (severity === "warning") markerEl.classList.add("is-warning");
    if (severity === "critical") markerEl.classList.add("is-critical");
  }

  function loadStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_e) {
      return fallback;
    }
  }

  function saveStorage(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_e) {
      /* Ignore storage quota issues in restricted browsers */
    }
  }

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function round1(val) {
    return Math.round(val * 10) / 10;
  }

  function randRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  function average(arr) {
    if (!arr.length) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function init() {
    state.selectedRoomId = state.prefs.defaultRoomId || "RM-01";
    SensorConfig.pollIntervalMs = state.prefs.pollIntervalMs || 5000;

    // Seed 24 historical live samples per room
    const now = Date.now();
    for (let i = 23; i >= 0; i--) {
      const ts = now - i * SensorConfig.pollIntervalMs;
      state.rooms.forEach((room) => {
        const sample = DemoSensorProvider.sampleRoom(room, state.thresholds, ts);
        state.roomReadings[room.id].push(sample);
        if (i < 3) state.recentGlobalReadings.unshift(sample);
      });
    }

    state.analyticsDaily = DemoSensorProvider.generate30DayAnalytics(state.rooms, state.thresholds);
    seedInitialAlerts();
    populateSelects();
    applyAnalyticsPreset(14);
    bindEvents();
    renderAll();
    startStreamLoop();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

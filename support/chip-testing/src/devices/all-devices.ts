/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Side-effect imports — each module's top-level registerDeviceType() call runs.
// Adding a future device type is a one-line edit here plus a new file.
import "./ContactSensorEndpoint.js";
import "./DimmableLightEndpoint.js";
import "./OccupancySensorEndpoint.js";
import "./OnOffLightEndpoint.js";
import "./TemperatureSensorEndpoint.js";
import "./WaterLeakDetectorEndpoint.js";

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MqttEndpointFactory, ServiceBundle } from "@matter/general";
import { MqttJsEndpointFactory } from "./MqttJsEndpointFactory.js";

ServiceBundle.default.add(env => env.set(MqttEndpointFactory, new MqttJsEndpointFactory()));

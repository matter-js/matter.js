/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EnergyEvse } from "@matter/types/clusters/energy-evse";
import { EnergyEvseBehavior } from "./EnergyEvseBehavior.js";

/**
 * This is the default server implementation of {@link EnergyEvseBehavior}.
 */
export class EnergyEvseServer extends EnergyEvseBehavior.with(EnergyEvse.Feature.ChargingPreferences) {}

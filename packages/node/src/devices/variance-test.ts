/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Compile-only regression test for ClusterBehavior.Type variance during declaration emit.
 *
 * When `.with()` returns a computed type, tsc uses structural (not nominal) checking. Any chained method call
 * (`.alter()`, `.with()`, etc.) then triggers structural verification of the `this` constraint during declaration emit.
 *
 * The root cause was that `B["Internal"]` (indexed access) and `B extends { id: infer S extends ... }` (conditional
 * with infer...extends) in the Type interface caused tsc to deeply expand B's structure, which transitively triggered
 * contravariant checking on N. The fix is to pre-compute these as additional type parameters on Type so tsc sees them
 * as already-resolved.
 *
 * If this file fails to compile, the variance issue has regressed.
 */

import { LevelControlServer as BaseLevelControlServer } from "../behaviors/level-control/LevelControlServer.js";
import { ColorControlServer as BaseColorControlServer } from "../behaviors/color-control/ColorControlServer.js";
import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import { ThermostatServer as BaseThermostatServer } from "../behaviors/thermostat/ThermostatServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";

/**
 * LevelControl .with().alter() — the original failing pattern from device files.
 */
export namespace TestLevelControl {
    export const LevelControlServer = BaseLevelControlServer
        .with("Lighting", "OnOff")
        .alter({
            attributes: {
                currentLevel: { min: 1, max: 254 },
            },
        });
}

/**
 * ColorControl .with().alter().
 */
export namespace TestColorControl {
    export const ColorControlServer = BaseColorControlServer
        .with("ColorTemperature")
        .alter({
            attributes: {
                startUpColorTemperatureMireds: { default: 0 },
            },
        });
}

/**
 * OnOff .with().alter().
 */
export namespace TestOnOff {
    export const OnOffServer = BaseOnOffServer
        .with("Lighting")
        .alter({ attributes: {} });
}

/**
 * Thermostat .with().alter().
 */
export namespace TestThermostat {
    export const ThermostatServer = BaseThermostatServer
        .with("Heating")
        .alter({ attributes: {} });
}

/**
 * Identify .with().alter() — minimal cluster.
 */
export namespace TestIdentify {
    export const IdentifyServer = BaseIdentifyServer
        .with()
        .alter({ attributes: {} });
}

/**
 * Chained .with().with().
 */
export namespace TestDoubleWith {
    export const LevelControlServer = BaseLevelControlServer
        .with("Lighting", "OnOff")
        .with();
}

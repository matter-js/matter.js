/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import { Seconds } from "@matter/general";
import { PowerSource } from "@matter/types/clusters/power-source";
import { PowerSourceBehavior } from "./PowerSourceBehavior.js";

const PowerSourceLevelBase = PowerSourceBehavior.with(
    PowerSource.Feature.Battery,
    PowerSource.Feature.Rechargeable,
    PowerSource.Feature.Wired,
);

/**
 * This is the default server implementation of {@link PowerSourceBehavior}.
 */
export class PowerSourceBaseServer extends PowerSourceLevelBase {
    override async initialize() {
        (await this.agent.load(DescriptorServer)).addDeviceTypes("PowerSource");

        // According to specs changes to these attributes should not occur more often than every 10 seconds
        [
            this.events.batPercentRemaining$Changed,
            this.events.batTimeRemaining$Changed,
            this.events.batTimeToFullCharge$Changed,
        ].forEach(event => {
            if (event !== undefined) {
                event.quiet.minimumEmitInterval = Seconds(10);
            }
        });

        if (this.state.status === undefined) {
            this.state.status = PowerSource.PowerSourceStatus.Unspecified;
        }

        if (this.state.description === undefined) {
            if (this.features.wired) {
                this.state.description = "Mains power";
            } else if (this.features.battery) {
                this.state.description = "Battery power";
            }
        }

        if (this.features.battery) {
            if (this.state.batChargeLevel === undefined) {
                this.state.batChargeLevel = PowerSource.BatChargeLevel.Ok;
            }
            if (this.state.batReplaceability === undefined) {
                this.state.batReplaceability = PowerSource.BatReplaceability.Unspecified;
            }
        }

        if (this.features.wired) {
            if (this.state.wiredCurrentType === undefined) {
                this.state.wiredCurrentType = PowerSource.WiredCurrentType.Ac;
            }
        }
    }
}

// We had turned on some more features to provide the default implementation, but export the cluster with default
// Features again.
export class PowerSourceServer extends PowerSourceBaseServer.for(PowerSource) {}

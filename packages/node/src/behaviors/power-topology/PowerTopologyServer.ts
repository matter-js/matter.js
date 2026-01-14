/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import { ElectricalEnergyMeasurementBehavior } from "#behaviors/electrical-energy-measurement";
import { ElectricalPowerMeasurementBehavior } from "#behaviors/electrical-power-measurement";
import { PowerTopology } from "#clusters/power-topology";
import { ImplementationError } from "#general";
import { ClusterType, EndpointNumber } from "#types";
import { PowerTopologyBehavior } from "./PowerTopologyBehavior.js";

const PowerTopologyBase = PowerTopologyBehavior.with(
    PowerTopology.Feature.SetTopology,
    PowerTopology.Feature.DynamicPowerFlow,
);

/**
 * This is the default server implementation of {@link PowerTopologyBehavior}.
 *
 * The Matter specification requires the PowerTopology cluster to support features we do not enable by default. You
 * should use {@link PowerTopologyServer.with} to specialize the class for the features your implementation supports.
 *
 * The default implementation verifies that the active endpoints are a subset of the available endpoints when
 * the SetTopology and DynamicPowerFlow features are used.
 */
export class PowerTopologyBaseServer extends PowerTopologyBase {
    override async initialize() {
        if (this.agent.has(ElectricalPowerMeasurementBehavior) || this.agent.has(ElectricalEnergyMeasurementBehavior)) {
            (await this.agent.load(DescriptorServer)).addDeviceTypes("ElectricalSensor");
        }

        if (this.state.activeEndpoints !== undefined) {
            this.#assertActiveEndpointsAllowed(this.state.activeEndpoints);
            this.reactTo(this.events.activeEndpoints$Changing, this.#assertActiveEndpointsAllowed);
        }
    }

    #assertActiveEndpointsAllowed(list: EndpointNumber[]) {
        const availableEndpoints = this.state.availableEndpoints;
        list.forEach(endpoint => {
            if (!availableEndpoints.includes(endpoint)) {
                throw new ImplementationError(`Endpoint ${endpoint} is not in the list of available endpoints`);
            }
        });
    }
}

export class PowerTopologyServer extends PowerTopologyBaseServer.for(ClusterType(PowerTopology.Base)) {}

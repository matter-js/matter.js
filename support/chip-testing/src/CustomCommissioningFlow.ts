/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ControllerCommissioningFlow, ControllerCommissioningFlowOptions, InteractionClient } from "@matter/main/node";
import { CertificateAuthority, Fabric, PeerAddress } from "@matter/main/protocol";

/**
 * Custom commissioning Flow for Chip Controller Tests which does not update the Fabric Label,
 * because chip also does not do this. It also demonstrates the new feature to use own Commissioning Flows.
 */
export class CustomCommissioningFlow extends ControllerCommissioningFlow {
    constructor(
        interactionClient: InteractionClient,
        ca: CertificateAuthority,
        fabric: Fabric,
        commissioningOptions: ControllerCommissioningFlowOptions,
        transitionToCase: (
            peerAddress: PeerAddress,
            supportsConcurrentConnections: boolean,
        ) => Promise<InteractionClient | undefined>,
    ) {
        super(interactionClient, ca, fabric, commissioningOptions, transitionToCase);

        // Find and Remove the UpdateFabricLabel step because chip does not do it, so we should also not do it
        const updateLabelStepIndex = this.commissioningSteps.findIndex(
            step => step.name === "OperationalCredentials.UpdateFabricLabel",
        );
        if (updateLabelStepIndex === -1) {
            throw new Error("UpdateFabricLabel step not found");
        }
        this.commissioningSteps.splice(updateLabelStepIndex, 1);
    }
}

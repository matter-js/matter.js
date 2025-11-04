/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    JointFabricDatastoreServer as BaseJointFabricDatastoreServer
} from "../behaviors/joint-fabric-datastore/JointFabricDatastoreServer.js";
import {
    JointFabricAdministratorServer as BaseJointFabricAdministratorServer
} from "../behaviors/joint-fabric-administrator/JointFabricAdministratorServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { DeviceClassification } from "#model";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * A Joint Fabric Administrator device provides capabilities to manage the Joint Fabric Datastore and issue an ICAC
 * signed by the Joint Fabric Anchor Root CA.
 *
 * A client wanting to access the capabilities of the Joint Fabric Administrator may use the Joint Commissioning Method
 * (as specified in the Matter core specification) to be commissioned onto the Joint Fabric. Once commissioned, a client
 * may access the capabilities of the Joint Fabric Administrator.
 *
 * @see {@link MatterSpecification.v142.Device} § 2.9
 */
export interface JointFabricAdministratorEndpoint extends Identity<typeof JointFabricAdministratorEndpointDefinition> {}

export namespace JointFabricAdministratorRequirements {
    /**
     * The JointFabricDatastore cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link JointFabricDatastoreServer} for convenience.
     */
    export const JointFabricDatastoreServer = BaseJointFabricDatastoreServer;

    /**
     * The JointFabricAdministrator cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link JointFabricAdministratorServer} for convenience.
     */
    export const JointFabricAdministratorServer = BaseJointFabricAdministratorServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            JointFabricDatastore: JointFabricDatastoreServer,
            JointFabricAdministrator: JointFabricAdministratorServer
        }
    };
}

export const JointFabricAdministratorEndpointDefinition = MutableEndpoint({
    name: "JointFabricAdministrator",
    deviceType: 0x130,
    deviceRevision: 1,
    deviceClass: DeviceClassification.Utility,
    requirements: JointFabricAdministratorRequirements,
    behaviors: SupportedBehaviors(
        JointFabricAdministratorRequirements.server.mandatory.JointFabricDatastore,
        JointFabricAdministratorRequirements.server.mandatory.JointFabricAdministrator
    )
});

export const JointFabricAdministratorEndpoint: JointFabricAdministratorEndpoint = JointFabricAdministratorEndpointDefinition;

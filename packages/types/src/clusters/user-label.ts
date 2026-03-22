/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { Label } from "./label.js";
import { AccessLevel } from "@matter/model";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace UserLabel {
    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x41,
        name: "UserLabel",
        revision: 1,

        attributes: {
            /**
             * The server shall support the storage of up to 4 list entries in this attribute. The server may support
             * the storage of more than 4 entries in this attribute.
             *
             * When reading from this attribute, the server shall respond with the actual contents of the attribute
             * which may contain any number of entries (possibly more than 4), When writing to this attribute, a client
             * may include any number of entries to be written, or none at all.
             *
             * If an attempt is made to write to this attribute with a list length that is not supported by the server,
             * the server shall respond with RESOURCE_EXHAUSTED.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.9.4.1
             */
            labelList: WritableAttribute(
                0x0,
                TlvArray(Label.TlvLabelStruct, { minLength: 0 }),
                { persistent: true, default: [], writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * This cluster is derived from the Label cluster and provides a feature to tag an endpoint with zero or more
     * writable labels.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.9
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type UserLabelCluster = UserLabel.Cluster;
export const UserLabelCluster = UserLabel.Cluster;
ClusterRegistry.register(UserLabel.Complete);

/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute, FixedAttribute } from "../cluster/Cluster.js";
import { TlvString } from "../tlv/TlvString.js";
import { AccessLevel } from "#model";
import { TlvArray } from "../tlv/TlvArray.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace LocalizationConfiguration {
    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x2b,
        name: "LocalizationConfiguration",
        revision: 1,

        attributes: {
            /**
             * The ActiveLocale attribute shall represent the locale that the Node is currently configured to use when
             * conveying information. The ActiveLocale attribute shall be a Language Tag as defined by BCP47. The
             * ActiveLocale attribute shall have a default value assigned by the Vendor and shall be a value contained
             * within the SupportedLocales attribute.
             *
             * An attempt to write a value to ActiveLocale that is not present in SupportedLocales shall result in a
             * CONSTRAINT_ERROR error.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.3.4.1
             */
            activeLocale: WritableAttribute(
                0x0,
                TlvString.bound({ maxLength: 35 }),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * The SupportedLocales attribute shall represent a list of locale strings that are valid values for the
             * ActiveLocale attribute. The list shall NOT contain any duplicate entries. The ordering of items within
             * the list SHOULD NOT express any meaning.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.3.4.2
             */
            supportedLocales: FixedAttribute(0x1, TlvArray(TlvString, { maxLength: 32 }), { default: [] })
        }
    });

    /**
     * Nodes should be expected to be deployed to any and all regions of the world. These global regions may have
     * differing common languages, units of measurements, and numerical formatting standards. As such, Nodes that
     * visually or audibly convey information need a mechanism by which they can be configured to use a user’s preferred
     * language, units, etc.
     *
     * This cluster supports an interface to a Node. It provides attributes for determining and configuring localization
     * information that a Node shall utilize when conveying values to a user.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type LocalizationConfigurationCluster = LocalizationConfiguration.Cluster;
export const LocalizationConfigurationCluster = LocalizationConfiguration.Cluster;
ClusterRegistry.register(LocalizationConfiguration.Complete);

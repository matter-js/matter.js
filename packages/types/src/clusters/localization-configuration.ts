/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableAttribute, FixedAttribute } from "../cluster/Cluster.js";
import { TlvString } from "../tlv/TlvString.js";
import { AccessLevel, LocalizationConfiguration as LocalizationConfigurationModel } from "@matter/model";
import { TlvArray } from "../tlv/TlvArray.js";
import { Identity } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the LocalizationConfiguration cluster.
 */
export namespace LocalizationConfiguration {
    /**
     * {@link LocalizationConfiguration} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
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
            activeLocale: string;

            /**
             * The SupportedLocales attribute shall represent a list of locale strings that are valid values for the
             * ActiveLocale attribute. The list shall NOT contain any duplicate entries. The ordering of items within
             * the list SHOULD NOT express any meaning.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.3.4.2
             */
            readonly supportedLocales: string[];
        }
    }

    /**
     * Attributes that may appear in {@link LocalizationConfiguration}.
     */
    export interface Attributes {
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
        activeLocale: string;

        /**
         * The SupportedLocales attribute shall represent a list of locale strings that are valid values for the
         * ActiveLocale attribute. The list shall NOT contain any duplicate entries. The ordering of items within the
         * list SHOULD NOT express any meaning.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.3.4.2
         */
        readonly supportedLocales: string[];
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

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
    export const id = ClusterId(0x2b);
    export const name = "LocalizationConfiguration" as const;
    export const revision = 1;
    export const schema = LocalizationConfigurationModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const Typing: LocalizationConfiguration;
}

export type LocalizationConfigurationCluster = LocalizationConfiguration.Cluster;
export const LocalizationConfigurationCluster = LocalizationConfiguration.Cluster;
ClusterNamespace.define(LocalizationConfiguration);
export interface LocalizationConfiguration extends ClusterTyping { Attributes: LocalizationConfiguration.Attributes; Components: LocalizationConfiguration.Components }

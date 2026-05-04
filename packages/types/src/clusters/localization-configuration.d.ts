/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the LocalizationConfiguration cluster.
 *
 * Nodes should be expected to be deployed to any and all regions of the world. These global regions may have differing
 * common languages, units of measurements, and numerical formatting standards. As such, Nodes that visually or audibly
 * convey information need a mechanism by which they can be configured to use a user’s preferred language, units, etc.
 *
 * This cluster supports an interface to a Node. It provides attributes for determining and configuring localization
 * information that a Node shall utilize when conveying values to a user.
 *
 * @see {@link MatterSpecification.v151.Core} § 11.3
 */
export declare namespace LocalizationConfiguration {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x002b;

    /**
     * Textual cluster identifier.
     */
    export const name: "LocalizationConfiguration";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the LocalizationConfiguration cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link LocalizationConfiguration} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * The ActiveLocale attribute shall represent the locale that the Node is currently configured to use when
         * conveying information. The ActiveLocale attribute shall be a Language Tag as defined by BCP47. The
         * ActiveLocale attribute shall have a default value assigned by the Vendor and shall be a value contained
         * within the SupportedLocales attribute.
         *
         * An attempt to write a value to ActiveLocale that is not present in SupportedLocales shall result in a
         * CONSTRAINT_ERROR error.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.3.4.1
         */
        activeLocale: string;

        /**
         * The SupportedLocales attribute shall represent a list of locale strings that are valid values for the
         * ActiveLocale attribute. The list shall NOT contain any duplicate entries. The ordering of items within the
         * list SHOULD NOT express any meaning.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.3.4.2
         */
        supportedLocales: string[];
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
         * @see {@link MatterSpecification.v151.Core} § 11.3.4.1
         */
        activeLocale: string;

        /**
         * The SupportedLocales attribute shall represent a list of locale strings that are valid values for the
         * ActiveLocale attribute. The list shall NOT contain any duplicate entries. The ordering of items within the
         * list SHOULD NOT express any meaning.
         *
         * @see {@link MatterSpecification.v151.Core} § 11.3.4.2
         */
        supportedLocales: string[];
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link LocalizationConfiguration}.
     */
    export const Cluster: typeof LocalizationConfiguration;

    /**
     * @deprecated Use {@link LocalizationConfiguration}.
     */
    export const Complete: typeof LocalizationConfiguration;

    export const Typing: LocalizationConfiguration;
}

/**
 * @deprecated Use {@link LocalizationConfiguration}.
 */
export declare const LocalizationConfigurationCluster: typeof LocalizationConfiguration;

export interface LocalizationConfiguration extends ClusterTyping {
    Attributes: LocalizationConfiguration.Attributes;
    Components: LocalizationConfiguration.Components;
}

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { LocalizationConfiguration as LocalizationConfigurationModel } from "@matter/model";
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

    export const id = ClusterId(0x2b);
    export const name = "LocalizationConfiguration" as const;
    export const revision = 1;
    export const schema = LocalizationConfigurationModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof LocalizationConfiguration;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `LocalizationConfiguration` instead of
     * `LocalizationConfiguration.Complete`)
     */
    export type Complete = typeof LocalizationConfiguration;

    export declare const Complete: Complete;
    export declare const Typing: LocalizationConfiguration;
}

ClusterNamespace.define(LocalizationConfiguration);
export type LocalizationConfigurationCluster = LocalizationConfiguration.Cluster;
export const LocalizationConfigurationCluster = LocalizationConfiguration.Cluster;
export interface LocalizationConfiguration extends ClusterTyping { Attributes: LocalizationConfiguration.Attributes; Components: LocalizationConfiguration.Components }

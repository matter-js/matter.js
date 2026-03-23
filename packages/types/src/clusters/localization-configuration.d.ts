/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { LocalizationConfiguration as LocalizationConfigurationModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the LocalizationConfiguration cluster.
 */
export declare namespace LocalizationConfiguration {
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

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id: ClusterId;
    export const name: "LocalizationConfiguration";
    export const revision: 1;
    export const schema: typeof LocalizationConfigurationModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const Cluster: typeof LocalizationConfiguration;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `LocalizationConfiguration` instead of
     * `LocalizationConfiguration.Complete`)
     */
    export const Complete: typeof LocalizationConfiguration;

    export const Typing: LocalizationConfiguration;
}

export declare const LocalizationConfigurationCluster: typeof LocalizationConfiguration;
export interface LocalizationConfiguration extends ClusterTyping { Attributes: LocalizationConfiguration.Attributes; Components: LocalizationConfiguration.Components }

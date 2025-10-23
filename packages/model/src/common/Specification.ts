/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Matter specification documents.
 */
export enum Specification {
    Core = "core",
    Cluster = "cluster",
    Device = "device",
    Namespace = "namespace",
}

export namespace Specification {
    /**
     * Long names for Matter specification documents.
     */
    export enum Names {
        core = "Matter Core Specification",
        cluster = "Matter Application Cluster Specification",
        device = "Matter Device Library Specification",
        namespace = "Matter Standard Namespace Specification",
    }

    /**
     * Information on the source of an element.
     */
    export type CrossReference = {
        /**
         * The defining document for the element.
         */
        document: `${Specification}`;

        /**
         * The section of the defining document that most specifically
         * addresses the element.
         */
        section: string;
    };

    /**
     * Matter specification version.
     */
    export type Revision =
        | `${number}.${number}`
        | `${number}.${number}.${number}`
        | `${number}.${number}.${number}.${number}`;

    /**
     * The default specification revision for Matter.js.
     */
    export const REVISION = "1.4.2";

    /**
     * Binary version of specification revision defined by Basic Information Cluster.
     *
     * Currently spec says least significant octet is "reserved", so it should remain zero.
     */
    export const SPECIFICATION_VERSION = 0x01040200;

    /**
     * Data model revision associated with the default revision of Matter.
     */
    export const DATA_MODEL_REVISION = 19;

    /**
     * Interaction model revision associated with the default revision of Matter.
     */
    export const INTERACTION_MODEL_REVISION = 12;
}

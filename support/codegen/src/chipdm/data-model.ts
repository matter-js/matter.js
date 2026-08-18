/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Access, Conformance, Constraint, ElementTag, FieldValue, Quality } from "#model";

/**
 * An element of the CHIP data model, reduced to the properties we validate.
 *
 * Aspects are undefined when CHIP does not define them, which the comparator treats as "no opinion" rather than as an
 * empty definition.
 */
export interface DmElement {
    tag: ElementTag;
    id?: number;
    name: string;
    type?: string;
    entryType?: string;
    conformance?: Conformance;
    constraint?: Constraint;
    access?: Access;
    quality?: Quality;
    default?: FieldValue;
    direction?: "request" | "response";
    response?: string;
    priority?: string;

    /** For {@link ElementTag.Requirement}, the kind of element required */
    element?: string;

    children: DmElement[];
}

export interface DmCluster extends DmElement {
    tag: ElementTag.Cluster;
    id: number;
    revision: number;
    classification?: string;

    /** Set when the cluster shares its definition with other cluster IDs, as the concentration measurement family does */
    base?: string;
}

export interface DmDeviceType extends DmElement {
    tag: ElementTag.DeviceType;

    /** Undefined for the base device type, which exists only to be derived from */
    id?: number;
    revision: number;
    classification?: string;
}

export interface DmSemanticNamespace extends DmElement {
    tag: ElementTag.SemanticNamespace;
    id: number;
}

/** The CHIP data model for one Matter version */
export interface DataModel {
    version: string;
    source: string;
    clusters: DmCluster[];
    deviceTypes: DmDeviceType[];
    namespaces: DmSemanticNamespace[];
    globals: DmElement[];

    /** Commands CHIP defines globally; we model them in the clusters that use them, so they are not compared */
    globalCommands: DmElement[];

    /** Clusters CHIP defines without a cluster ID; we model these as base clusters */
    baseClusters: DmCluster[];
}

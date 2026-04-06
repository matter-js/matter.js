/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Specification } from "#model";

/**
 * A parsed spec table with string cell values.
 */
export type Table = {
    /** Used to identify split tables */
    firstRowIdentity?: string;

    /** Field names */
    fields: string[];

    /** Column name -> cell text */
    rows: { [name: string]: string | undefined }[];

    /** Single-cell rows, tend to be informational; beforeRowIndex indicates which row index they precede */
    notes: Array<{ note: string; beforeRowIndex: number }>;
};

/**
 * A reference to a specific portion of the specification.
 */
export interface SpecReference {
    xref: Specification.CrossReference;
    name: string;
    path: string;
    tables?: Table[];
    prose?: string[];
    detailSection?: string;
    details?: SpecReference[];
    /** Markdown content for top-level document references passed through to the scanner */
    markdownContent?: string;
}

/**
 * Intermediate representation of a global element not defined in a cluster.
 */
export interface GlobalReference extends SpecReference {
    type: "global";
    format: "datatypes" | "elements" | "standalone" | "statusCodes";
}

/**
 * Intermediate representation of a cluster.
 */
export interface ClusterReference extends SpecReference {
    type: "cluster";
    ids?: SpecReference;
    revisions?: SpecReference;
    classifications?: SpecReference;
    features?: SpecReference;
    attributes?: SpecReference;
    attributeSets?: SpecReference[];
    commands?: SpecReference;
    events?: SpecReference;
    statusCodes?: SpecReference;
    datatypes?: SpecReference[];
    namespace?: SpecReference[];
}

/**
 * Intermediate representation of a device type.
 */
export interface DeviceReference extends SpecReference {
    category?: string;
    classification?: SpecReference;
    revisions?: SpecReference;
    conditionSets?: SpecReference[];
    conditionRequirements?: SpecReference;
    clusters?: SpecReference;
    elements?: SpecReference;
    composingTypes?: SpecReference;
    composingClusters?: SpecReference;
    composingElements?: SpecReference;
}

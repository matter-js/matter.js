/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Specification } from "#model";

/**
 * An HTML table
 */
export type Table = {
    /** Used to identify split tables */
    firstRowIdentity?: string;

    /** Field names */
    fields: string[];

    /** Column name -> defining HTML element */
    rows: { [name: string]: HTMLElement | undefined }[];

    /** Single-cell rows, tend to be informational */
    notes: HTMLElement[];
};

/**
 * A reference to a specific portion of the specification.  Captures details as raw HTML DOM nodes from the Matter
 * specification
 */
export interface HtmlReference {
    xref: Specification.CrossReference;
    name: string;
    path: string;
    tables?: Table[];
    prose?: HTMLElement[];
    detailSection?: string;
    details?: HtmlReference[];
}

/**
 * Intermediate representation of a global element not defined in a cluster.
 */
export interface GlobalReference extends HtmlReference {
    type: "global";
    format: "datatypes" | "elements" | "standalone" | "statusCodes";
}

/**
 * Intermediate representation of a cluster.  Has all the bits we think we'll need but still encoded as ugly HTML
 */
export interface ClusterReference extends HtmlReference {
    type: "cluster";
    ids?: HtmlReference;
    revisions?: HtmlReference;
    classifications?: HtmlReference;
    features?: HtmlReference;
    attributes?: HtmlReference;
    attributeSets?: HtmlReference[];
    commands?: HtmlReference;
    events?: HtmlReference;
    statusCodes?: HtmlReference;
    datatypes?: HtmlReference[];
    namespace?: HtmlReference[];
}

/**
 * Intermediate representation of a device type.
 */
export interface DeviceReference extends HtmlReference {
    category?: string;
    classification?: HtmlReference;
    revisions?: HtmlReference;
    conditionSets?: HtmlReference[];
    clusters?: HtmlReference;
    elements?: HtmlReference;
    composingTypes?: HtmlReference;
    composingElements?: HtmlReference;
}

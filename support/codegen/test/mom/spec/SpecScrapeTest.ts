/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#general";
import type { AnyElement, AttributeElement, DatatypeElement } from "#model";
import { loadClusters } from "#mom/spec/load-clusters.js";
import { loadNamespaces } from "#mom/spec/load-namespaces.js";
import type { SpecReference } from "#mom/spec/spec-types.js";
import { translateCluster } from "#mom/spec/translate-cluster.js";
import { translateGlobal } from "#mom/spec/translate-global.js";
import { translateNamespace } from "#mom/spec/translate-namespace.js";

const Cluster = `
# 5.17. Service Area Cluster

A cluster for areas.

## 5.17.1. Revision History

| Revision | Description |
| --- | --- |
| 1 | Initial revision |

## 5.17.2. Classification

| Hierarchy | Role | Scope | PICS Code |
| --- | --- | --- | --- |
| Base | Application | Endpoint | SEAR |

## 5.17.3. Cluster ID

| ID | Name |
| --- | --- |
| 0x0150 | Service Area |

## 5.17.5. Data Types

### 5.17.5.1. SkipAreaStatus Type

This data type is derived from enum8.

| Value | Name | Summary | Conformance |
| --- | --- | --- | --- |
| 0x00 | Success | Skipped | M |

### 5.17.5.2. OperationalStatusEnum Type

This data type is derived from enum8.

| Value | Name | Summary | Conformance |
| --- | --- | --- | --- |
| 0x00 | Pending | Not yet operated at | M |

#### 5.17.5.2.1. SelectAreasStatus Type

This data type is derived from enum8.

| Value | Name | Summary | Conformance |
| --- | --- | --- | --- |
| 0x00 | Success | Allowed and possible | M |

### 5.17.5.3. RadioBandBitmap Type

Bitmap of frequency bands that a Device supports.

This data type is derived from map16.

| Bit | Name | Summary | Conformance |
| --- | --- | --- | --- |
| 8 | Band6 | 6 GHz | M |

### 5.17.5.4. RDRStruct Type

The units used for these fields are derived from IEEE 802.11-2024 clause 11.

| ID | Name | Type | Constraint | Quality | Fallback | Access | Conformance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Gain | int8 | all |  |  |  | M |

### 5.17.5.6. ErrorEnum Type

This data type is derived from enum8.

| Value | Name | Summary |
| --- | --- | --- |
| 0x00 to 0x3F | GeneralErrors | Generally applicable values for error, defined herein |
| 0x40 to 0x7F | DerivedClusterErrors | Derived Cluster defined errors |
| 0x80 to 0xBF | ManufacturerError | Vendor specific errors |

The general error values are defined in the table below.

| Value | Name | Summary | Conformance |
| --- | --- | --- | --- |
| 0x00 | NoError | No error | M |

### 5.17.5.7. SensorTypeEnum Type

This data type is derived from enum8.

| Value | Name | Summary | Conformance |
| --- | --- | --- | --- |
| 0 | Photodiode | Photodiode sensor | M |
| 64 to 254 | MS | Reserved for manufacturer specific sensor types | O |

### 5.17.5.5. Client Table

The client table is shared.

#### 5.17.5.5.1. Management

The client table requires collaborative management.

## 5.17.6. Attributes

| ID | Name | Type | Constraint | Quality | Fallback | Access | Conformance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0x0000 | OverPowerThreshold | int64 | all |  | 2<sup>62</sup> | R V | M |
| 0x0001 | UnderPowerThreshold | int64 | all |  | -2<sup>62</sup> | R V | M |
`;

const DataTypes = `
# 14.19. Data Types

## 14.19.2. Derived Data Types

<table>
<thead>
<tr>
<th>Class</th>
<th>Data Type</th>
<th>Short</th>
<th>Base Type</th>
</tr>
</thead>
<tbody>
<tr>
<td>Enumeration</td>
<td>Medium Type</td>
<td>medium-type</td>
<td>enum8</td>
</tr>
<tr>
<td>Octet string</td>
<td>IPv6 Address</td>
<td>ipv6adr</td>
<td>octstr</td>
</tr>
<tr>
<td>Struct</td>
<td>Semantic Tag</td>
<td><a href="#ref_DataTypeSemTag">SemanticTagStruct</a></td>
<td>struct</td>
</tr>
</tbody>
</table>

### 14.19.2.22. Medium Type Type

An enumeration value that indicates a physical medium.

| Value | Name | Summary | Conformance |
| --- | --- | --- | --- |
| 0 | Air | The medium is air | M |

### 14.19.2.44. IPv6 Address

The IPv6 address type is an octet string of 16 bytes.

### 14.19.2.47. SemanticTagStruct Type

This data type is derived from struct.

| ID | Name | Type | Constraint | Quality | Default | Access | Conformance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | MfgCode | vendor-id | desc | X | null |  | M |
`;

function document(markdownContent: string, xrefDocument: "cluster" | "core" | "namespace"): SpecReference {
    return {
        xref: { document: xrefDocument, section: "" },
        name: "Specification",
        path: "specification.md",
        markdownContent,
    };
}

function scrapeCluster() {
    const refs = [...loadClusters(document(Cluster, "cluster"))];
    expect(refs.length).equal(1);
    const [ref] = refs;
    if (ref.type !== "cluster") {
        throw new InternalError(`Expected a cluster, scraped ${ref.type}`);
    }
    const clusters = [...translateCluster(ref)];
    expect(clusters.length).equal(1);
    return clusters[0];
}

function scrapeGlobals(markdown = DataTypes) {
    return [...loadClusters(document(markdown, "core"))].flatMap(ref =>
        ref.type === "global" ? [...translateGlobal(ref)] : [],
    );
}

function named(elements: AnyElement[] | undefined, name: string) {
    const element = elements?.find(element => element.name === name);
    if (element === undefined) {
        throw new InternalError(`No element ${name}`);
    }
    return element;
}

function datatype(elements: AnyElement[] | undefined, name: string): DatatypeElement {
    const element = named(elements, name);
    if (element.tag !== "datatype") {
        throw new InternalError(`${name} is a ${element.tag}, not a datatype`);
    }
    return element;
}

function attribute(elements: AnyElement[] | undefined, name: string): AttributeElement {
    const element = named(elements, name);
    if (element.tag !== "attribute") {
        throw new InternalError(`${name} is a ${element.tag}, not an attribute`);
    }
    return element;
}

describe("cluster scrape", () => {
    describe("a datatype heading nested one level too deep", () => {
        it("is lifted to a datatype of the cluster", () => {
            expect(datatype(scrapeCluster().children, "SelectAreasStatus").type).equals("enum8");
        });

        it("stays a datatype where nested correctly", () => {
            expect(datatype(scrapeCluster().children, "SkipAreaStatus").type).equals("enum8");
        });
    });

    describe("the base type of a datatype", () => {
        it("is read from a later paragraph", () => {
            expect(datatype(scrapeCluster().children, "RadioBandBitmap").type).equals("map16");
        });

        it("is not a document cited after 'derived from'", () => {
            expect(datatype(scrapeCluster().children, "RDRStruct").type).equals("struct");
        });
    });

    describe("an enum range", () => {
        function members(name: string) {
            return datatype(scrapeCluster().children, name).children?.map(({ name, id, constraint, conformance }) => ({
                name,
                id,
                constraint,
                conformance,
            }));
        }

        it("becomes a member for a manufacturer range in a table of its own", () => {
            expect(members("ErrorEnum")).deep.equals([
                { name: "NoError", id: 0, constraint: undefined, conformance: "M" },
                { name: "ManufacturerError", id: undefined, constraint: "128 to 191", conformance: undefined },
            ]);
        });

        it("becomes a member for a manufacturer range among the values", () => {
            expect(members("SensorTypeEnum")).deep.equals([
                { name: "Photodiode", id: 0, constraint: undefined, conformance: "M" },
                { name: "Ms", id: undefined, constraint: "64 to 254", conformance: "O" },
            ]);
        });
    });

    it("skips prose among datatypes", () => {
        const names = scrapeCluster().children?.map(child => child.name);
        expect(names).not.include("Management");
        expect(names).not.include("ClientTable");
    });

    it("reads a power default as the number it states", () => {
        const attributes = scrapeCluster().children;
        expect(attribute(attributes, "OverPowerThreshold").default).equals("4611686018427387904");
        expect(attribute(attributes, "UnderPowerThreshold").default).equals("-4611686018427387904");
    });
});

describe("global datatype scrape", () => {
    it("details a hyphenated short name under its long name", () => {
        const medium = datatype(scrapeGlobals(), "medium-type");
        expect(medium.children?.map(child => child.name)).deep.equals(["Air"]);
    });

    it("details a global datatype under a long name without a type suffix", () => {
        const ipv6 = datatype(scrapeGlobals(), "ipv6adr");
        expect(ipv6.details).equals("The IPv6 address type is an octet string of 16 bytes.");
    });

    it("names the semantic tag struct semtag and keeps its fields", () => {
        const semtag = datatype(scrapeGlobals(), "semtag");
        expect(semtag.children?.map(child => child.name)).deep.equals(["MfgCode"]);
    });

    it("keeps the semantic tag fields where the table names it semtag", () => {
        const markdown = DataTypes.replace('<a href="#ref_DataTypeSemTag">SemanticTagStruct</a>', "semtag");
        const semtag = datatype(scrapeGlobals(markdown), "semtag");
        expect(semtag.children?.map(child => child.name)).deep.equals(["MfgCode"]);
    });
});

describe("namespace scrape", () => {
    function scrapeNamespaces(markdown: string) {
        return [...loadNamespaces(document(markdown, "namespace"))].flatMap(ref => [...translateNamespace(ref)]);
    }

    const Table = `| ID | Namespace |
| --- | --- |
| 0x01 | Common Closure |

| ID | Name | Summary |
| --- | --- | --- |
| 0x00 | Opening | Move toward open position |
`;

    it("reads a namespace that is a chapter", () => {
        const namespaces = scrapeNamespaces(`# 2. Common Closure Semantic Tag Namespace\n\n${Table}`);
        expect(namespaces.map(ns => ns.name)).deep.equals(["CommonClosure"]);
    });

    it("reads a namespace that is a section of a chapter", () => {
        const namespaces = scrapeNamespaces(
            `# 5. Common Namespaces\n\n## 5.1. Common Closure Semantic Tag Namespace\n\n${Table}\n## 5.2. Other Heading\n\nText.\n`,
        );
        expect(namespaces.map(ns => ns.name)).deep.equals(["CommonClosure"]);
    });

    it("ends a namespace at the next section of its level", () => {
        const namespaces = scrapeNamespaces(
            `# 5. Common Namespaces\n\n## 5.1. Common Closure Semantic Tag Namespace\n\n${Table}\n### 5.1.1. Opening Tag\n\nThe closure opens.\n\n## 5.2. Other Heading\n\n### 5.2.1. Opening Tag\n\nSomething else opens.\n`,
        );
        const opening = namespaces[0].children?.find(tag => tag.name === "Opening");
        expect(opening?.details).equals("The closure opens.");
    });
});

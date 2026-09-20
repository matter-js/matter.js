/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConditionElement, DeviceTypeElement, RequirementElement } from "#model";
import { loadDevices } from "#mom/spec/load-devices.js";
import type { SpecReference } from "#mom/spec/spec-types.js";
import { translateDevice } from "#mom/spec/translate-device.js";

const Chapter = `
# 8. Closure Device Types

## 8.5. Closure Device Type

A Closure seals an opening.

## 8.5.1. Revision History

This is the revision history for this device type.

| Revision | Description |
| --- | --- |
| 1 | Initial revision |

## 8.5.2. Classification

The identifiers for this device type are listed below.

| Device Type ID | Device Type Name | Class | Scope |
| --- | --- | --- | --- |
| 0x0230 | Closure | Simple | Endpoint |

## 8.5.3. Conditions

This device type MAY support the following conformance conditions as defined below.

See the Base Device Type definition for conformance tags.

| Condition | Description |
| --- | --- |
| Panelled | See description below. |

### 8.5.3.1. Panelled Condition

The Panelled condition applies when the closure exposes a panel.

### 8.5.3.2. Protocol Conditions

| Condition | Description |
| --- | --- |
| Wired | See description below. |

#### 8.5.3.2.1. Wired Condition

The Wired condition applies when the closure is mains powered.

## 8.5.4. Cluster Requirements

Each endpoint supporting the Closure device type SHALL include these clusters based on the conformance defined below. A Closure SHALL use exactly one semantic tag from the Closure namespace.

| Cluster ID | Cluster Name | Client/Server | Conformance |
| --- | --- | --- | --- |
| 0x0003 | Identify | Server | M |

## 8.5.5. Element Requirements

The table below lists qualities and conformance that override the cluster specification requirements. A blank table cell means there is no change to that item and the value from the cluster specification applies.

| Cluster ID | Cluster Name | Element | Name | Conformance |
| --- | --- | --- | --- | --- |
| 0x001D | Descriptor | Feature | TagList | M |

## 8.5.6. Device Type Requirements

| Device Type ID | Device Type Name | Conformance |
| --- | --- | --- |
| 0x0231 | Closure Panel | O |

### 8.5.6.1. Element Requirements on Component Device Types

| Device Type ID | Device Type Name | Cluster ID | Cluster Name | Element | Name | Conformance |
| --- | --- | --- | --- | --- | --- | --- |
| 0x0231 | Closure Panel | 0x0104 | Closure Control | attribute | CountdownTime | M |

## 8.5.7. Cluster Usage

### 8.5.7.1. Opening

#### 8.5.7.1.1. Preconditions

The closure SHALL be closed.

- Latched, when the closure supports latching.

### 8.5.7.2. Closing

#### 8.5.7.2.1. Preconditions

The closure is open.
`;

function scrapeClosure() {
    const document: SpecReference = {
        xref: { document: "device", section: "" },
        name: "Device Library",
        path: "device_library.md",
        markdownContent: Chapter,
    };

    const devices = [...loadDevices(document)].flatMap(deviceRef => [...translateDevice(deviceRef)]);
    expect(devices.length).equal(1);
    return devices[0] as DeviceTypeElement;
}

function childNamed(element: { children?: unknown[] }, name: string) {
    return (element.children as Array<{ name: string }> | undefined)?.find(child => child.name === name);
}

describe("scrape of a device type chapter", () => {
    it("documents the device from its subsections and omits the sections the model already states", () => {
        expect(scrapeClosure().details).equal(
            "A Closure seals an opening.\n" +
                "### Cluster Requirements\n" +
                "A Closure shall use exactly one semantic tag from the Closure namespace.\n" +
                "### Cluster Usage\n" +
                "#### Opening\n" +
                "##### Preconditions\n" +
                "The closure shall be closed.\n" +
                "- Latched, when the closure supports latching.\n" +
                "#### Closing\n" +
                "##### Preconditions\n" +
                "The closure is open.",
        );
    });

    it("gives a condition the prose of its own section", () => {
        const condition = childNamed(scrapeClosure(), "Panelled") as ConditionElement;
        expect(condition.details).equal("The Panelled condition applies when the closure exposes a panel.");
        expect(condition.xref).deep.equal({ document: "device", section: "8.5.3.1" });
    });

    it("gives a nested condition set's detail to the innermost set that encloses it", () => {
        const condition = childNamed(scrapeClosure(), "Wired") as ConditionElement;
        expect(condition.details).equal("The Wired condition applies when the closure is mains powered.");
        expect(condition.xref).deep.equal({ document: "device", section: "8.5.3.2.1" });
    });

    it("gives an element requirement the section its table came from", () => {
        const descriptor = childNamed(scrapeClosure(), "Descriptor") as RequirementElement;
        const tagList = childNamed(descriptor, "TAGLIST") as RequirementElement;
        expect(tagList.xref).deep.equal({ document: "device", section: "8.5.5" });
    });

    it("gives a component device type's element requirement the section its table came from", () => {
        const panel = childNamed(scrapeClosure(), "ClosurePanel") as RequirementElement;
        const control = childNamed(panel, "ClosureControl") as RequirementElement;
        const countdownTime = childNamed(control, "CountdownTime") as RequirementElement;
        expect(countdownTime.xref).deep.equal({ document: "device", section: "8.5.6.1" });
    });
});

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, LogFormat, Logger } from "#general";
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

const ArchitectureChapter = `
# 10. Media Device Types

## 10.1. Video Player Architecture

### 10.1.1. Introduction

A Video Player renders content.

### 10.1.2. Commissioning

A Video Player SHALL support commissioning from a casting device.

## 10.2. Basic Video Player Device Type

A Basic Video Player renders content.

## 10.2.1. Revision History

| Revision | Description |
| --- | --- |
| 1 | Initial revision |

## 10.2.2. Classification

| Device Type ID | Device Type Name | Class | Scope |
| --- | --- | --- | --- |
| 0x0028 | Basic Video Player | Simple | Endpoint |
`;

/**
 * Capture what a scrape writes to the log.
 */
function captured(fn: () => void) {
    const destination = Logger.destinations.default;
    const original = { ...destination };
    const messages = new Array<string>();
    try {
        destination.format = LogFormat.formats.plain;
        destination.write = (message: string, _diagnostic: Diagnostic.Message) => {
            messages.push(message);
        };
        fn();
    } finally {
        Object.assign(destination, original);
    }
    return messages;
}

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

describe("scrape of the Base device type", () => {
    const BaseChapter = `
# 1. Base Device Type

## 1.1. Base Device Type

The Base device type defines conformance for all device types.

## 1.1.1. Revision History

| Revision | Description |
| --- | --- |
| 1 | Initial revision |
| 2 | Conditions added |
| 3 | Clarifications |
`;

    it("records the revision its own table states, having no device type id to carry one", () => {
        const document: SpecReference = {
            xref: { document: "device", section: "" },
            name: "Device Library",
            path: "device_library.md",
            markdownContent: BaseChapter,
        };

        const devices = [...loadDevices(document)].flatMap(deviceRef => [...translateDevice(deviceRef)]);

        expect(devices.map(device => device.name)).deep.equal(["Base"]);
        expect(devices[0].revision).equals(3);
    });
});

describe("scrape of a chapter that is not a device type", () => {
    function scrapeArchitecture() {
        const document: SpecReference = {
            xref: { document: "device", section: "" },
            name: "Device Library",
            path: "device_library.md",
            markdownContent: ArchitectureChapter,
        };

        let devices = Array<DeviceTypeElement>();
        const messages = captured(() => {
            devices = [...loadDevices(document)].flatMap(deviceRef => [...translateDevice(deviceRef)]);
        });
        return { devices, messages };
    }

    it("reports what an architecture chapter costs rather than dropping it in silence", () => {
        const { messages } = scrapeArchitecture();
        expect(
            messages.some(message =>
                message.includes("ignored Video Player Architecture and the 2 sections below it (device § 10.1)"),
            ),
            messages.join("\n"),
        ).true;
    });

    it("keeps the device type that follows an architecture chapter", () => {
        const { devices } = scrapeArchitecture();
        expect(devices.map(device => device.name)).deep.equal(["BasicVideoPlayer"]);
    });

    it("reports an architecture chapter that ends the document", () => {
        const document: SpecReference = {
            xref: { document: "device", section: "" },
            name: "Device Library",
            path: "device_library.md",
            markdownContent:
                "# 10. Media Device Types\n\n## 10.1. Video Player Architecture\n\n### 10.1.1. Introduction\n\nA Video Player renders content.\n",
        };

        const messages = captured(() => {
            expect([...loadDevices(document)]).deep.equal([]);
        });

        expect(
            messages.some(message =>
                message.includes("ignored Video Player Architecture and the 1 section below it (device § 10.1)"),
            ),
            messages.join("\n"),
        ).true;
    });

    it("reports an architecture chapter that a new category follows", () => {
        const document: SpecReference = {
            xref: { document: "device", section: "" },
            name: "Device Library",
            path: "device_library.md",
            markdownContent:
                "# 10. Media Device Types\n\n## 10.1. Video Player Architecture\n\n### 10.1.1. Introduction\n\nA Video Player renders content.\n\n# 11. Generic Device Types\n",
        };

        const messages = captured(() => {
            expect([...loadDevices(document)]).deep.equal([]);
        });

        expect(
            messages.some(message =>
                message.includes("ignored Video Player Architecture and the 1 section below it (device § 10.1)"),
            ),
            messages.join("\n"),
        ).true;
    });
});

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

describe("scrape of a condition requirement", () => {
    const OvenChapter = `
# 11. Appliance Device Types

## 11.1. Oven Device Type

An Oven cooks food.

## 11.1.1. Revision History

| Revision | Description |
| --- | --- |
| 1 | Initial revision |

## 11.1.2. Classification

| Device Type ID | Device Type Name | Class | Scope |
| --- | --- | --- | --- |
| 0x007B | Oven | Simple | Endpoint |

## 11.1.3. Condition Requirements

| Location   | Device Type ID | Device Type Name               | Condition | Conformance | Constraint |
| --- | --- | --- | --- | --- | --- |
| Descendant | 0x0071         | Temperature Controlled Cabinet | Heater    | M           | min 1      |
`;

    const ToasterChapter = `
# 12. Appliance Device Types

## 12.1. Toaster Device Type

A Toaster toasts bread.

## 12.1.1. Revision History

| Revision | Description |
| --- | --- |
| 1 | Initial revision |

## 12.1.2. Classification

| Device Type ID | Device Type Name | Class | Scope |
| --- | --- | --- | --- |
| 0x007C | Toaster | Simple | Endpoint |

## 12.1.3. Condition Requirements

| Device Type ID | Device Type Name               | Condition | Conformance |
| --- | --- | --- | --- |
| 0x0071 | Temperature Controlled Cabinet | Heater | M |
`;

    function scrapeDevices(markdownContent: string) {
        const document: SpecReference = {
            xref: { document: "device", section: "" },
            name: "Device Library",
            path: "device_library.md",
            markdownContent,
        };

        let devices = Array<DeviceTypeElement>();
        const messages = captured(() => {
            devices = [...loadDevices(document)].flatMap(deviceRef => [...translateDevice(deviceRef)]);
        });
        return { devices, messages };
    }

    it("keeps the location and constraint of a condition requirement", () => {
        const { devices } = scrapeDevices(OvenChapter);
        const requirement = childNamed(devices[0], "Heater") as RequirementElement;

        expect(requirement.location).equals("Descendant");
        expect(requirement.constraint).equals("min 1");
        expect(requirement.type).equals("TemperatureControlledCabinet.Heater");
    });

    it("leaves location undefined and silent when the table has no Location column", () => {
        const { devices, messages } = scrapeDevices(ToasterChapter);
        const requirement = childNamed(devices[0], "Heater") as RequirementElement;

        expect(requirement.location).undefined;
        expect(
            messages.some(message => message.includes("unknown location")),
            messages.join("\n"),
        ).false;
    });

    describe("every location spelling the specification uses", () => {
        const LocationSpellingsChapter = `
# 14. Sensing Device Types

## 14.1. Probe Device Type

A Probe senses one quantity.

## 14.1.1. Revision History

| Revision | Description |
| --- | --- |
| 1 | Initial revision |

## 14.1.2. Classification

| Device Type ID | Device Type Name | Class | Scope |
| --- | --- | --- | --- |
| 0x007D | Probe | Simple | Endpoint |

## 14.1.3. Condition Requirements

| Location   | Condition   | Conformance |
| --- | --- | --- |
| Root       | AtRoot      | M |
| Root Node  | AtRootNode  | M |
| Self       | AtSelf      | M |
| Child      | AtChild     | M |
| Nowhere    | AtNowhere   | M |
`;

        const { devices, messages } = scrapeDevices(LocationSpellingsChapter);
        const device = devices[0];

        for (const [name, expected] of [
            ["AtRoot", "Root"],
            ["AtRootNode", "Root"],
            ["AtSelf", "Self"],
            ["AtChild", "Descendant"],
        ] as const) {
            it(`normalizes a "${name}" row's location to ${expected}`, () => {
                const requirement = childNamed(device, name) as RequirementElement;
                expect(requirement.location).equals(expected);
            });
        }

        it("leaves an unrecognized location undefined and names the device type and condition in the warning", () => {
            const requirement = childNamed(device, "AtNowhere") as RequirementElement;

            expect(requirement.location).undefined;
            expect(
                messages.some(
                    message =>
                        message.includes("unknown location") &&
                        message.includes("Probe") &&
                        message.includes("AtNowhere"),
                ),
                messages.join("\n"),
            ).true;
        });
    });
});

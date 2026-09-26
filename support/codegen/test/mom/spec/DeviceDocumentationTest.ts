/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { addDeviceDocumentation } from "#mom/spec/add-documentation.js";
import type { DeviceReference, SpecReference } from "#mom/spec/spec-types.js";

function subsection(name: string, section: string, ...prose: string[]): SpecReference {
    return { xref: { document: "device", section }, name, path: "test.md", prose };
}

function documented(lead: string[], subsections: SpecReference[]) {
    const deviceRef: DeviceReference = {
        xref: { document: "device", section: "8.5" },
        name: "Closure",
        path: "test.md",
        prose: lead,
        subsections,
    };
    const device = {} as { details?: string };
    addDeviceDocumentation(device, deviceRef);
    return device.details;
}

describe("documentation of a scraped device type", () => {
    it("adds each subsection under its own heading", () => {
        expect(
            documented(
                ["A Closure is an element that seals an opening."],
                [
                    subsection("Closure Architecture", "8.5.1", "A Closure SHALL use exactly one semantic tag."),
                    subsection("Element Requirements", "8.5.6", "The TagList SHALL meet the following constraints."),
                ],
            ),
        ).equal(
            "A Closure is an element that seals an opening.\n" +
                "### Closure Architecture\n" +
                "A Closure shall use exactly one semantic tag.\n" +
                "### Element Requirements\n" +
                "The TagList shall meet the following constraints.",
        );
    });

    it("drops the boilerplate that every chapter repeats", () => {
        expect(
            documented(
                ["A Closure is an element that seals an opening."],
                [
                    subsection(
                        "Cluster Requirements",
                        "8.5.5",
                        "Each endpoint supporting the Closure device type MAY include these clusters based on the conformance defined below.",
                    ),
                    subsection("Conditions", "8.5.3", "See the Base Device Type definition for conformance tags."),
                    subsection(
                        "Cluster Requirements",
                        "8.5.4",
                        "Each Matter device type implementation SHALL include these clusters, as a minimum set, based on the conformance defined below.",
                    ),
                    subsection(
                        "Element Requirements",
                        "8.5.6",
                        "The table below lists qualities and conformance that override the cluster specification requirements. A blank table cell means there is no change to that item and the value from the cluster specification applies.",
                    ),
                ],
            ),
        ).equal("A Closure is an element that seals an opening.");
    });

    it("drops a boilerplate sentence that shares its paragraph with real content", () => {
        expect(
            documented(
                [],
                [
                    subsection(
                        "Cluster Requirements",
                        "8.5.5",
                        "Each node supporting this device type SHALL include these clusters based on the conformance defined below. A node SHALL only ever have one instance.",
                    ),
                ],
            ),
        ).equal("### Cluster Requirements\nA node shall only ever have one instance.");
    });

    it("starts a new block after a list item rather than continuing it", () => {
        expect(
            documented(
                [],
                [
                    subsection(
                        "Cluster Usage",
                        "8.5.6",
                        "- cluster Descriptor with its TagList containing two tags: Position.Right and Number.Two",
                        "If this device were to have labeling on the buttons, a second tag applies.",
                    ),
                ],
            ),
        ).equal(
            "### Cluster Usage\n" +
                "- cluster Descriptor with its TagList containing two tags: Position.Right and Number.Two\n" +
                "If this device were to have labeling on the buttons, a second tag applies.",
        );
    });

    it("stops adding heading markers where they stop being a heading", () => {
        expect(documented([], [subsection("Detail", "8.5.6.1.2.3.4.5", "Nested deeply.")])).equal(
            "###### Detail\nNested deeply.",
        );
    });

    it("nests a heading by the depth of its section and heads the sections above it", () => {
        expect(
            documented(
                [],
                [
                    subsection("Cluster Usage", "8.5.6"),
                    subsection("Opening", "8.5.6.1"),
                    subsection("Preconditions", "8.5.6.1.1", "The closure is closed."),
                    subsection("Closing", "8.5.6.2"),
                    subsection("Preconditions", "8.5.6.2.1", "The closure is open."),
                ],
            ),
        ).equal(
            "### Cluster Usage\n" +
                "#### Opening\n" +
                "##### Preconditions\n" +
                "The closure is closed.\n" +
                "#### Closing\n" +
                "##### Preconditions\n" +
                "The closure is open.",
        );
    });

    it("keeps prose that merely resembles the boilerplate", () => {
        expect(
            documented(
                [],
                [subsection("Conditions", "8.5.3", "Please see the Base Device Type definition for conformance tags.")],
            ),
        ).equal("### Conditions\nPlease see the Base Device Type definition for conformance tags.");
    });

    it("omits a heading for a subsection left with nothing to say", () => {
        expect(
            documented(
                ["A Closure is an element that seals an opening."],
                [
                    subsection(
                        "Cluster Requirements",
                        "8.5.5",
                        "The table below lists conditions and conformance values that override the device type definition.",
                    ),
                    subsection("Element Requirements", "8.5.6", "The TagList SHALL meet the following constraints."),
                ],
            ),
        ).equal(
            "A Closure is an element that seals an opening.\n" +
                "### Element Requirements\n" +
                "The TagList shall meet the following constraints.",
        );
    });
});

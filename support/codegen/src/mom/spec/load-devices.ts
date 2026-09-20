/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { scanSpec } from "./scan-spec.js";
import { DeviceReference, SpecReference } from "./spec-types.js";

const logger = Logger.get("load-devices");

function augmentDevice(device: DeviceReference, content: SpecReference) {
    let name = content.name.toLowerCase();
    if (name.endsWith(" conditions")) {
        name = "conditions";
    } else if (name === "base cluster requirements for matter") {
        name = "cluster requirements";
    }

    let what: string | undefined;

    // A section whose prose only announces the table below it contributes nothing the generated model does not
    // already state, and a section whose prose describes one element belongs to that element rather than the device
    let documented = true;

    switch (name) {
        case "conditions":
            what = `conditions "${content.name}"`;
            if (device.conditionSets) {
                device.conditionSets?.push(content);
            } else {
                device.conditionSets = [content];
            }
            documented = false;
            break;

        case "cluster requirements":
            what = "clusters";
            device.clusters = content;
            break;

        case "revision history":
            what = "revisions";
            device.revisions = content;
            documented = false;
            break;

        case "classification":
            what = "classification";
            device.classification = content;
            documented = false;
            break;

        case "element requirements":
            what = "elements";
            device.elements = content;
            break;

        case "device type requirements":
            what = "composingTypes";
            device.composingTypes = content;
            break;

        case "cluster requirements on component device types":
        case "cluster requirements on composing device types": // pre-1.5 spec terminology
            what = "composingClusters";
            device.composingClusters = content;
            break;

        case "element requirements on component device types":
            what = "composingElements";
            device.composingElements = content;
            break;

        case "condition requirements":
            what = "conditionRequirements";
            device.conditionRequirements = content;
            break;

        default: {
            // Collect sub-sections of conditionRequirements as details (e.g. "ManagedAclAllowed Condition")
            if (
                device.conditionRequirements &&
                content.xref.section.startsWith(device.conditionRequirements.xref.section + ".")
            ) {
                if (!device.conditionRequirements.details) {
                    device.conditionRequirements.details = [];
                }
                device.conditionRequirements.details.push(content);
                what = `conditionRequirements detail "${content.name}"`;
                documented = false;
                break;
            }

            // Condition sets nest, so the innermost enclosing set owns the section
            const conditionSet = device.conditionSets
                ?.filter(set => content.xref.section.startsWith(set.xref.section + "."))
                .sort((a, b) => b.xref.section.length - a.xref.section.length)[0];
            if (conditionSet) {
                if (!conditionSet.details) {
                    conditionSet.details = [];
                }
                conditionSet.details.push(content);
                what = `conditions detail "${content.name}"`;
                documented = false;
                break;
            }

            logger.debug(`ignore ${content.name}`);
            break;
        }
    }

    if (documented) {
        if (device.subsections) {
            device.subsections.push(content);
        } else {
            device.subsections = [content];
        }
    }

    if (what) {
        logger.info(`${what} (${content.xref.document} § ${content.xref.section})`);
    }
}

export function* loadDevices(devices: SpecReference) {
    let category: string | undefined;
    let device: DeviceReference | undefined;

    function* emit() {
        if (device) {
            yield device;
            device = undefined;
        }
    }

    for (const section of scanSpec(devices)) {
        const depth = section.xref.section.split(".").length;
        switch (depth) {
            case 1:
                yield* emit();
                category = section.name.replace(/\s+device types$/i, "");
                break;

            case 2:
                yield* emit();

                if (section.name.match(/\s+architecture$/i)) {
                    break;
                }

                device = {
                    ...section,
                    name: section.name.replace(/\s+device type/i, ""),
                    category,
                };

                logger.info(`discovered ${device.name} (${device.xref.document} § ${device.xref.section})`);
                break;

            default:
                Logger.nest(() => {
                    if (device) {
                        augmentDevice(device, section);
                    }
                });
                break;
        }
    }

    // Emit final device
    yield* emit();
}

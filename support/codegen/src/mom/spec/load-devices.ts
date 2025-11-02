/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { scanDocument } from "./scan-document.js";
import { DeviceReference, HtmlReference } from "./spec-types.js";

const logger = Logger.get("load-devices");

function augmentDevice(device: DeviceReference, content: HtmlReference) {
    let name = content.name.toLowerCase();
    if (name.endsWith(" conditions")) {
        name = "conditions";
    } else if (name === "base cluster requirements for matter") {
        name = "cluster requirements";
    }

    let what: string | undefined;
    switch (name) {
        case "conditions":
            what = `conditions "${content.name}"`;
            if (device.conditionSets) {
                device.conditionSets?.push(content);
            } else {
                device.conditionSets = [content];
            }
            break;

        case "cluster requirements":
            what = "clusters";
            device.clusters = content;
            break;

        case "revision history":
            what = "revisions";
            device.revisions = content;
            break;

        case "classification":
            what = "classification";
            device.classification = content;
            break;

        case "element requirements":
            what = "elements";
            device.elements = content;
            break;

        case "device type requirements":
            what = "composingTypes";
            device.composingTypes = content;
            break;

        case "cluster requirements on composing device types":
            what = "composingElements";
            device.composingElements = content;
            break;

        default:
            logger.debug(`ignore ${content.name}`);
            break;
    }

    if (what) {
        logger.info(`${what} (${content.xref.document} § ${content.xref.section})`);
    }
}

export function* loadDevices(devices: HtmlReference) {
    let category: string | undefined;
    let device: DeviceReference | undefined;

    function* emit() {
        if (device) {
            yield device;
            device = undefined;
        }
    }

    for (const section of scanDocument(devices)) {
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
}

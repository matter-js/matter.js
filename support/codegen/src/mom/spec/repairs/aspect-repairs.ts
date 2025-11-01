/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Model } from "#model";

export function repairConstraint(record: { constraint?: string }) {
    const { constraint } = record;
    if (!constraint) {
        return;
    }

    // Remove units and otherwise normalize constraint
    record.constraint = constraint
        .replace(/ octets| entries| bytes| per node/i, "")
        .replace(/ to(\d|max)/i, " to $1")
        .replace(/ValuetoMax/, "Value to Max")
        .replace(/Sup ported/, "Supported")
        .replace(/N\/A/, "")

        // Window covering decided to use " " as binary separator which spec does not support
        .replace(/(0b[01]{4}) ([01]{4})/, "$1$2");

    // Ignore window covering's bitmap constraints
    if (constraint.match(/^[0x]{4} [0x]{4}$/)) {
        delete record.constraint;
    }
}

export function isZigbee(model: Model, zigbeeFeatures?: string[]) {
    const conformance = (model as { conformance?: unknown }).conformance?.toString();
    if (conformance === undefined) {
        return;
    }
    if (conformance.match(/\[?[Zz]igbee\]?(?:, D)?/)) {
        return true;
    }

    if (zigbeeFeatures === undefined) {
        return;
    }
    for (const feature of zigbeeFeatures) {
        if (conformance === feature || conformance === `[${feature}]`) {
            return true;
        }
    }
}

export function repairConformanceRule(conformance?: string) {
    if (!conformance) {
        return;
    }

    if (conformance === "Matter!Zigbee") {
        return;
    }

    // This is global FabricScoped attribute.  We only install on fabric-scoped structs so if it's present it's
    // mandatory
    if (conformance.match(/fabric\s*-\s*scoped/i)) {
        return "M";
    }

    conformance = conformance.replace("PIRUnoccupiedToOccupied", "PirUnoccupiedToOccupied");

    // Words separated by space is illegal and we can safely assume should be joined
    conformance = conformance.replace(/([a-z])\s+([a-z])/gi, "$1$2");

    // Core uses "Wi-Fi" as an informal feature name in RootEndpoint's requirements
    conformance = conformance.replace(/Wi-Fi/, "WiFi");

    // "Status == SUCCESS" should be "Status == Success" (cluster 1.4.2)
    conformance = conformance.replace(/status == success/gi, "Status == Success");

    // Null is specified with inconsistent case ("MfgCode != NULL" in cluster 1.4.2, lowercase elsewhere)
    conformance = conformance.replace(/= null/gi, "= null");

    // Opcreds "OK" StatusCode specified with incorrect case (cluster 1.4.2)
    conformance = conformance.replace(/StatusCode == OK/g, "StatusCode == Ok");

    return conformance;
}

export function repairConformance(record: { name?: string; conformance?: string }) {
    if (record.name === "SCH" && record.conformance === "[Zigbee], D") {
        // Assuming this is just laziness and will change until confirmed otherwise here:
        //
        //   https://github.com/espressif/esp-matter/issues/923#issuecomment-2105989691
        record.conformance = "O";
    }
}

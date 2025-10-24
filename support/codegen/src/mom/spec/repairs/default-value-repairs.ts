/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export function repairDefaultValue(record: { default?: string; type?: string }) {
    const { default: def } = record;
    if (def === undefined) {
        return;
    }

    if (typeof def === "string") {
        switch (def.toLowerCase()) {
            case "desc": // See description
            case "n/a": // Not available
            case "ms": // Manufacturer specific
            case "-": // Sometimes used for "none"
            case "–": // This is perhaps the dash used for "none"
                delete record.default;
                break;

            case "empty":
                if (record.type?.toLowerCase().startsWith("enum") || record.type?.toLowerCase().endsWith("enum")) {
                    delete record.default;
                }
                break;

            case "varied":
                record.default = "any";
                break;

            case "!lt:0lt:1":
                // Pump control conditional defaults; just ignore
                delete record.default;
                break;

            case "ok":
                // Core 1.4.2 uses "OK" instead of "Success" for fallback status code.  They also incorrectly name the
                // type as "StatusCode" so handle that and the correct variant in case they ever fix
                if (record.type === "status" || record.type === "StatusCode") {
                    record.default = "Success";
                }
                break;

            default:
                // Sometimes enum values are suffixed with enum name in parenthesis
                if (def.match(/^\d+\(.*\)$/)) {
                    record.default = def.replace(/^(\d+).*/, "$1");
                }

                // Sometimes default value strings have "" around them
                if (def.startsWith('"') && def.endsWith('"')) {
                    record.default = def.slice(1, def.length - 1);
                }
                break;
        }
    }
}

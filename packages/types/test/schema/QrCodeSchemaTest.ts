/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { QrCode } from "#schema/QrCodeSchema.js";

const QR_CODE = [
    "▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄",
    "█⠀▄▄▄▄▄⠀██▀▄▀▄█⠀▄▄▄▄▄⠀█",
    "█⠀█⠀⠀⠀█⠀█▄▀▄▀▄█⠀█⠀⠀⠀█⠀█",
    "█⠀█▄▄▄█⠀██⠀▀▀▄█⠀█▄▄▄█⠀█",
    "█▄▄▄▄▄▄▄█⠀█⠀▀▄█▄▄▄▄▄▄▄█",
    "█▄▄⠀▀▄▄▄▄⠀▀⠀█⠀⠀▄▀██⠀█▀█",
    "█▀▄▀▄⠀▄▄⠀▀▀█⠀▀⠀▀⠀⠀⠀▀█▀█",
    "█▄▄▄██▄▄▄█▀▄▀⠀▀▄▄⠀█▄▄▀█",
    "█⠀▄▄▄▄▄⠀█⠀⠀⠀█▄█▄▀█▀⠀█⠀█",
    "█⠀█⠀⠀⠀█⠀█▄▀▄█▄⠀▄▀▄▀▀▀██",
    "█⠀█▄▄▄█⠀█⠀█▀█▄█⠀⠀▀▄▀▀⠀█",
    "█▄▄▄▄▄▄▄█▄█▄█▄████▄▄█▄█",
    "▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀",
    "",
].join("\n");

describe("QrCodeSchema", () => {
    describe("encode", () => {
        it("encodes a string", () => {
            const result = QrCode.encode("MT:6FCJ142C00KA0648G00");

            expect(result).equal(QR_CODE);
        });
    });
});

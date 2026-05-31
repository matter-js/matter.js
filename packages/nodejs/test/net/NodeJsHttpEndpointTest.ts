/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsHttpEndpoint } from "#net/NodeJsHttpEndpoint.js";
import { NetworkError } from "@matter/general";
import { type AddressInfo, createServer } from "node:net";

// The endpoint requires a concrete port (a wildcard "0" port is omitted from listen options), so allocate a free one.
function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const probe = createServer();
        probe.on("error", reject);
        probe.listen(0, "127.0.0.1", () => {
            const port = (probe.address() as AddressInfo).port;
            probe.close(() => resolve(port));
        });
    });
}

describe("NodeJsHttpEndpoint", () => {
    it("serves responses from the HTTP handler", async () => {
        const port = await freePort();
        const endpoint = await NodeJsHttpEndpoint.create({ address: `http://127.0.0.1:${port}` });
        endpoint.http = request => new Response(`echo ${new URL(request.url).pathname}`, { status: 200 });

        try {
            const response = await fetch(`http://127.0.0.1:${port}/hello`);

            expect(response.status).equal(200);
            expect(await response.text()).equal("echo /hello");
        } finally {
            await endpoint.close();
        }
    });

    it("returns 404 when the handler yields no response", async () => {
        const port = await freePort();
        const endpoint = await NodeJsHttpEndpoint.create({ address: `http://127.0.0.1:${port}` });
        endpoint.http = () => undefined;

        try {
            const response = await fetch(`http://127.0.0.1:${port}/missing`);
            expect(response.status).equal(404);
        } finally {
            await endpoint.close();
        }
    });

    it("refuses an HTTPS endpoint without a certificate", async () => {
        await expect(NodeJsHttpEndpoint.create({ address: "https://127.0.0.1:0" })).rejectedWith(
            NetworkError,
            "no certificate",
        );
    });
});

/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SPECIFICATION_NAMESPACE, specificationNamespace } from "#util/specification-namespace.js";

describe("specificationNamespace", () => {
    it("names a minor release without a patch level", () => {
        expect(specificationNamespace("1.6")).equals("MatterSpecification.v16");
        expect(specificationNamespace("1.6.0")).equals("MatterSpecification.v16");
    });

    it("appends a nonzero patch level", () => {
        expect(specificationNamespace("1.4.1")).equals("MatterSpecification.v141");
        expect(specificationNamespace("1.6.1")).equals("MatterSpecification.v161");
    });

    // {@link} targets are not type-checked, so a missing namespace would silently break every generated link
    if (typeof window === "undefined") {
        it("is declared for the current revision", async () => {
            const { readMatterFile } = await import("#util/file.js");
            const declarations = readMatterFile("!model/dts/Specifications.d.ts");
            const name = SPECIFICATION_NAMESPACE.replace("MatterSpecification.", "");
            const start = declarations.indexOf(`export namespace ${name} {`);
            expect(start).not.equals(-1);

            const body = declarations.slice(start, declarations.indexOf("\n    }\n", start));
            for (const document of ["Core", "Cluster", "Device", "Namespace"]) {
                expect(body).contains(`export interface ${document} {}`);
            }
        });

        it("is the namespace generated links name", async () => {
            const { readMatterFile } = await import("#util/file.js");
            const generated = readMatterFile("!clusters/on-off.d.ts");
            const links = generated.match(/MatterSpecification\.v\d+\.\w+/g) ?? [];
            expect(links).not.empty;
            expect(links.filter(link => !link.startsWith(`${SPECIFICATION_NAMESPACE}.`))).deep.equals([]);
        });
    }
});

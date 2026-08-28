/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/main";
import { attribute, cluster, uint8 } from "@matter/main/model";
import { Matter } from "@matter/model";
import { expect } from "chai";
import { certClusterModelFor, findCertCluster, registerCertCustomCluster } from "../../src/cert/custom-clusters.js";
import { FaultInjectionCluster } from "../cert/fault-injection.js";

const FAULT_INJECTION_ID = 0xfff1fc06;
const UNREGISTERED_ID = 0xfff1fc07;

@cluster(0x120bfc02)
class VendorCluster {
    @attribute(0x0010, uint8)
    setting?: number;
}

@cluster(0x120bfc02)
class OtherVendorCluster {
    @attribute(0x0011, uint8)
    other?: number;
}

@cluster(6)
class ShadowsOnOff {}

class Undecorated {}

// Registration is process-global and deliberately has no undo — a cert test registers its clusters at
// import time, and a reset hook here would unregister them out from under a test file running later in
// the same process. Each case therefore claims an id no other case uses.
describe("cert custom clusters", () => {
    it("resolves a registered cluster by id and by name, with its commands", () => {
        const model = registerCertCustomCluster(FaultInjectionCluster);

        expect(model.id).equals(FAULT_INJECTION_ID);
        expect(certClusterModelFor(FAULT_INJECTION_ID).model).equals(model);
        expect(certClusterModelFor("FaultInjection").model).equals(model);

        const failAtFault = model.commands("failAtFault");
        expect(failAtFault?.id).equals(0);
        expect(failAtFault?.fields.map(field => field.name)).deep.equal([
            "type",
            "id",
            "numCallsToSkip",
            "numCallsToFail",
            "takeMutex",
        ]);
    });

    it("does not resolve a cluster nobody registered", () => {
        expect(findCertCluster(UNREGISTERED_ID)).undefined;
        expect(() => certClusterModelFor(UNREGISTERED_ID)).throws(ImplementationError);
    });

    it("keeps resolving the standard model", () => {
        registerCertCustomCluster(FaultInjectionCluster);

        expect(certClusterModelFor("OnOff").model).equals(Matter.clusters.require("OnOff"));
    });

    it("registers the same class twice without complaint", () => {
        const first = registerCertCustomCluster(VendorCluster);

        expect(registerCertCustomCluster(VendorCluster)).equals(first);
    });

    it("refuses a second definition of an id already registered", () => {
        registerCertCustomCluster(VendorCluster);

        expect(() => registerCertCustomCluster(OtherVendorCluster)).throws(
            ImplementationError,
            /already registered for cluster/,
        );
        expect(certClusterModelFor(0x120bfc02).model.attributes("setting")).not.undefined;
    });

    it("refuses to shadow a cluster of the standard model", () => {
        expect(() => registerCertCustomCluster(ShadowsOnOff)).throws(ImplementationError, /standard Matter model/);
    });

    it("refuses a class carrying no cluster metadata", () => {
        expect(() => registerCertCustomCluster(Undecorated)).throws(/Metadata missing/);
    });
});

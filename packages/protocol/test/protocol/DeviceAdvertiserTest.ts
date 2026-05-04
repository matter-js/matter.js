/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Advertiser } from "#advertisement/Advertiser.js";
import { CommissioningMode } from "#advertisement/CommissioningMode.js";
import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { DeviceAdvertiser, DeviceAdvertiserContext } from "#protocol/DeviceAdvertiser.js";
import { Observable } from "@matter/general";
import { FabricIndex, NodeId, VendorId } from "@matter/types";

/**
 * Minimal mock advertiser that records calls to advertise().
 */
class MockAdvertiser extends Advertiser {
    readonly advertiseCalls: Array<{ description: ServiceDescription; event: Advertiser.BroadcastEvent }> = [];

    protected getAdvertisement(_description: ServiceDescription) {
        return undefined;
    }

    override advertise(description: ServiceDescription, event: Advertiser.BroadcastEvent) {
        this.advertiseCalls.push({ description, event });
        return undefined;
    }
}

/**
 * Create a minimal mock {@link DeviceAdvertiserContext} that wires up just enough observables for
 * the session-closed / commissioning-advertisement path exercised by these tests.
 */
function createMockContext() {
    const fabricsAdded = Observable<[any]>();
    const fabricsReplaced = Observable<[any]>();
    const fabricsDeleting = Observable<[any]>();

    const sessionsAdded = Observable<[any]>();
    const sessionsDeleted = Observable<[any]>();
    const retry = Observable<[any, any]>();
    const subscriptionsChanged = Observable<[any, any]>();

    // Which fabric index (if any) fabrics.maybeFor() should return a fabric for.
    let availableFabricIndex: FabricIndex | undefined;

    const fabrics = {
        events: {
            added: fabricsAdded,
            replaced: fabricsReplaced,
            deleting: fabricsDeleting,
        },
        maybeFor: (index: FabricIndex) => (index === availableFabricIndex ? ({} as any) : undefined),
        [Symbol.iterator]: () => ([] as any[]).values(),
    } as unknown as DeviceAdvertiserContext["fabrics"];

    const sessions = {
        sessions: {
            added: sessionsAdded,
            deleted: sessionsDeleted,
        },
        retry,
        subscriptionsChanged,
        forFabric: () => [] as any[],
    } as unknown as DeviceAdvertiserContext["sessions"];

    return {
        fabrics,
        sessions,
        sessionsDeleted,
        setAvailableFabricIndex: (i: FabricIndex) => {
            availableFabricIndex = i;
        },
    };
}

const COMMISSIONING_SERVICE = ServiceDescription.Commissionable({
    discriminator: 3840,
    mode: CommissioningMode.Basic,
    name: "Test Device",
    deviceType: 0x0100,
    vendorId: VendorId(0xfff1),
    productId: 0x8001,
});

describe("DeviceAdvertiser", () => {
    describe("session deleted handler", () => {
        it("resumes commissioning advertisement when a PASE session closes", async () => {
            const { fabrics, sessions, sessionsDeleted } = createMockContext();
            const advertiser = new MockAdvertiser();
            const deviceAdvertiser = new DeviceAdvertiser({ fabrics, sessions });
            deviceAdvertiser.addAdvertiser(advertiser);
            deviceAdvertiser.enterCommissioningMode(COMMISSIONING_SERVICE);

            // Drain the initial advertisement call from enterCommissioningMode
            advertiser.advertiseCalls.length = 0;

            // PASE session: fabric is undefined, isPase is true (peerNodeId is UNSPECIFIED)
            sessionsDeleted.emit({
                fabric: undefined,
                isPase: true,
                peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
            } as any);

            expect(advertiser.advertiseCalls.length).equal(1);
            expect(advertiser.advertiseCalls[0].description).deep.equal(COMMISSIONING_SERVICE);
        });

        it("does NOT resume commissioning advertisement when a CASE session for a deleted fabric closes", async () => {
            const { fabrics, sessions, sessionsDeleted } = createMockContext();
            const advertiser = new MockAdvertiser();
            const deviceAdvertiser = new DeviceAdvertiser({ fabrics, sessions });
            deviceAdvertiser.addAdvertiser(advertiser);
            deviceAdvertiser.enterCommissioningMode(COMMISSIONING_SERVICE);

            // Drain the initial advertisement call from enterCommissioningMode
            advertiser.advertiseCalls.length = 0;

            // CASE session for a fabric that was already removed from FabricManager
            // (decommissioning teardown scenario).  The fabric property references an object
            // but maybeFor() returns undefined because the fabric was deleted.
            sessionsDeleted.emit({
                fabric: { fabricIndex: FabricIndex(1) },
                isPase: false,
                peerNodeId: NodeId(1n),
            } as any);

            expect(advertiser.advertiseCalls.length).equal(0);
        });
    });

    describe("TCP T key in operational advertisements", () => {
        function createFabric() {
            return {
                fabricIndex: FabricIndex(1),
                globalId: 1n,
                nodeId: NodeId(1n),
            } as any;
        }

        it("includes tcp bitmap in operational advertisement when tcp is set", () => {
            const { fabrics, sessions } = createMockContext();
            const advertiser = new MockAdvertiser();
            const deviceAdvertiser = new DeviceAdvertiser({
                fabrics,
                sessions,
                supportedTransports: { tcpClient: true, tcpServer: true },
            });
            deviceAdvertiser.addAdvertiser(advertiser);
            deviceAdvertiser.enterOperationalMode();

            // Simulate a fabric being added to trigger operational advertisement
            const fabric = createFabric();
            (fabrics as any)[Symbol.iterator] = () => [fabric].values();
            (fabrics.events.added as Observable<[any]>).emit(fabric);

            const opAds = advertiser.advertiseCalls.filter(c => c.description.kind === "operational");
            expect(opAds.length).greaterThan(0);

            const desc = opAds[0].description as ServiceDescription.Operational;
            expect(desc.tcp).deep.equal({ tcpClient: true, tcpServer: true });
        });

        it("does not include tcp in operational advertisement when tcp is not set", () => {
            const { fabrics, sessions } = createMockContext();
            const advertiser = new MockAdvertiser();
            const deviceAdvertiser = new DeviceAdvertiser({ fabrics, sessions });
            deviceAdvertiser.addAdvertiser(advertiser);
            deviceAdvertiser.enterOperationalMode();

            const fabric = createFabric();
            (fabrics as any)[Symbol.iterator] = () => [fabric].values();
            (fabrics.events.added as Observable<[any]>).emit(fabric);

            const opAds = advertiser.advertiseCalls.filter(c => c.description.kind === "operational");
            expect(opAds.length).greaterThan(0);

            const desc = opAds[0].description as ServiceDescription.Operational;
            expect(desc.tcp).to.be.undefined;
        });

        it("supportedTransports setter updates context for subsequent advertisements", () => {
            const { fabrics, sessions } = createMockContext();
            const advertiser = new MockAdvertiser();
            const deviceAdvertiser = new DeviceAdvertiser({ fabrics, sessions });
            deviceAdvertiser.addAdvertiser(advertiser);
            deviceAdvertiser.enterOperationalMode();

            // Set transport support after construction
            deviceAdvertiser.supportedTransports = { tcpClient: false, tcpServer: true };

            const fabric = createFabric();
            (fabrics as any)[Symbol.iterator] = () => [fabric].values();
            (fabrics.events.added as Observable<[any]>).emit(fabric);

            const opAds = advertiser.advertiseCalls.filter(c => c.description.kind === "operational");
            expect(opAds.length).greaterThan(0);

            const desc = opAds[0].description as ServiceDescription.Operational;
            expect(desc.tcp).deep.equal({ tcpClient: false, tcpServer: true });
        });
    });
});

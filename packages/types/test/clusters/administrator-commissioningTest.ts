/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterType } from "#cluster/ClusterType.js";
import { ClusterComposer } from "#cluster/mutation/ClusterComposer.js";
import { MutableCluster } from "#cluster/mutation/MutableCluster.js";
import { AdministratorCommissioning } from "#clusters/administrator-commissioning.js";

const Cluster = AdministratorCommissioning.Cluster;
type Cluster = AdministratorCommissioning.Cluster;

// These are real-world functional and unit tests, primarily of extension as
// implemented by AdministratorCommissioningCluster.with().  We test numerous
// components of cluster composition individually so problematic definitions
// are readily identified.
//
// This is also helpful for diagnosing TS bugs 😐

describe("Administrator Commissioning Cluster", () => {
    it("defines basic properties correctly", () => {
        type Satisfactory = {
            id: 60;
            name: "AdministratorCommissioning";
        };

        // Purely type tests
        AdministratorCommissioning.Base satisfies Satisfactory;
        ({}) as ClusterType.Of<typeof AdministratorCommissioning.Base> satisfies Satisfactory;
        ClusterType(AdministratorCommissioning.Base) satisfies Satisfactory;
        ({}) as MutableCluster<typeof AdministratorCommissioning.Base> satisfies Satisfactory;
        MutableCluster(AdministratorCommissioning.Base) satisfies Satisfactory;
        AdministratorCommissioning.Cluster satisfies Satisfactory;
    });

    it("doesn't have basic commissioning by default", () => {
        type Satisfactory = {
            name: "AdministratorCommissioning";
            commands: {
                openCommissioningWindow: ClusterType.Command;
                openBasicCommissioningwindow?: undefined;
            };
        };

        // Type
        ({}) as Cluster satisfies Satisfactory;

        // Functional
        const cluster = Cluster;
        cluster satisfies Satisfactory;
        expect(typeof cluster.commands.openCommissioningWindow).equal("object");
        expect((cluster.commands as any).openBasicCommissioningWindow).undefined;
    });

    it("has basic commissioning when enabled", () => {
        type ExtensionCommand = {
            commands: {
                openBasicCommissioningWindow: ClusterType.Command;
            };
        };

        type Satisfactory = ExtensionCommand & {
            name: "AdministratorCommissioning";
            commands: {
                openCommissioningWindow: ClusterType.Command;
            };
        };

        type Extensions = Cluster["extensions"];

        // Type: FeaturesAsFlags (convert ["Basic"] to { basic: true })
        type Flags = ClusterComposer.FeaturesAsFlags<Cluster, ["Basic"]>;
        ({}) as Flags satisfies { basic: true };

        // Type: SelectedElements (extracts elements from basic component)
        type SelectedElements = ClusterComposer.SelectedElements<Flags, Extensions>;
        ({}) as SelectedElements satisfies ExtensionCommand;

        // Type: BaseOf (selects source of base elements)
        type BaseOf = ClusterComposer.BaseOf<Cluster>;
        ({}) as BaseOf satisfies Cluster;

        // Type: WithSelected (merges various element sources)
        type WithSelected = ClusterComposer.ExtendedElements<Cluster, SelectedElements>;
        ({}) as WithSelected satisfies { commands: Satisfactory["commands"] };

        // Type: WithFeatures (slightly lower-level than Of)
        type WithFeatures = ClusterComposer.WithFeatures<Cluster, ["Basic"]>;
        ({}) as WithFeatures satisfies Satisfactory;

        // Type: Full ClusterComposer typing (the return type of "with" method)
        ({}) as ClusterComposer.Of<Cluster, ["Basic"]> satisfies Satisfactory;

        // Type: Fake "with" (uses MutableCluster method typing)
        const fakeBase1 = { with() {} } as MutableCluster.Methods<Cluster>;
        const fakeWith1 = fakeBase1.with("Basic");
        fakeWith1 satisfies Satisfactory;

        // Type: Fake "with" 2 (creates cluster using options object)
        type FakeCluster1 = ClusterType.Of<AdministratorCommissioning.Cluster>;
        const fakeBase2 = { with() {} } as MutableCluster.Methods<FakeCluster1>;
        const fakeWith2 = fakeBase2.with("Basic");
        fakeWith2 satisfies Satisfactory;

        // Type: Fake "with" 3 (generates cluster using constituent types)
        type Base = typeof AdministratorCommissioning.Base;
        type FakeCluster2 = ClusterType.Of<Base>;
        const fakeBase3 = { with() {} } as MutableCluster.Methods<FakeCluster2>;
        const fakeWith3 = fakeBase3.with("Basic");
        fakeWith3 satisfies Satisfactory;

        // Type: Fake mutable cluster (fakes MutableCluster factory typing)
        const fakeBase4 = { with() {} } as MutableCluster<Cluster>;
        const fakeWith4 = fakeBase4.with("Basic");
        fakeWith4 satisfies Satisfactory;

        // Functional
        const cluster = Cluster.with("Basic");
        cluster satisfies Satisfactory;
        expect(typeof cluster.commands.openCommissioningWindow).equal("object");
        expect(typeof cluster.commands.openBasicCommissioningWindow).equal("object");
    });
});

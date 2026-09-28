/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeModel,
    ClusterModel,
    ConditionModel,
    DeviceTypeConformance,
    DeviceTypeModel,
    DeviceTypeScopeIndex,
    DeviceTypeValidationPass,
    DeviceTypeViolation,
    FeatureMap,
    FieldModel,
    Matter,
    MatterModel,
    NodeCondition,
    ReachingEndpoints,
    RequirementModel,
} from "#index.js";
import { ConditionAssertions, conditionScopeOf, StructuralCondition } from "#logic/device-types/ConditionAssertions.js";
import { ImplementationError } from "@matter/general";
import { endpoint, FakeEndpoint, FakeFacts } from "./fake-facts.js";

const ROOT_ID = 0x16;
const LIGHT_ID = 0xfff1_0001;
const COMPOSER_ID = 0xfff1_0002;
const COMPOSER2_ID = 0xfff1_0003;
const COMPOSER3_ID = 0xfff1_0004;
const COMPOSER4_ID = 0xfff1_0005;
const COMPOSER5_ID = 0xfff1_0006;
const PLUG_ID = 0xfff1_0007;
const COMPOSER6_ID = 0xfff1_0008;
const ON_OFF_ID = 6;
const SINGLETON_ID = 0x7ff0;
const GATE_CONDITION = "Gated";

/**
 * A model whose Light requires OnOff, OnOff's Lighting feature under {@link lighting} and OnOff's Pending attribute,
 * which the cluster itself defines under {@link pending}. Composer requires at least two Lights. RootNode declares
 * the Singleton cluster a singleton.
 */
function fixtureModel({ lighting = "O", pending = "P, O" }: { lighting?: string; pending?: string } = {}) {
    const featureMap = FeatureMap.clone();
    featureMap.children = [
        new FieldModel({ name: "LT", title: "Lighting", constraint: "0" }),
        new FieldModel({ name: "OFFONLY", title: "OffOnly", constraint: "2" }),
    ];

    const model = new MatterModel(
        {},
        new DeviceTypeModel(
            { name: "Base", classification: "base" },
            new ConditionModel({ name: "CustomNetworkConfig" }),
        ),
        new DeviceTypeModel(
            { name: "RootNode", id: ROOT_ID, classification: "node" },
            new RequirementModel({
                name: "Singleton",
                id: SINGLETON_ID,
                element: "serverCluster",
                conformance: "O",
                quality: "I",
            }),
        ),
        new DeviceTypeModel(
            { name: "Light", id: LIGHT_ID, classification: "simple" },
            new ConditionModel({ name: "Wanted" }),
            new RequirementModel(
                { name: "OnOff", id: ON_OFF_ID, element: "serverCluster", conformance: "M" },
                new RequirementModel({ name: "LT", element: "feature", conformance: lighting }),
                new RequirementModel({ name: "Pending", element: "attribute", conformance: "M" }),
            ),
        ),
        new DeviceTypeModel(
            { name: "Composer", id: COMPOSER_ID, classification: "simple" },
            new RequirementModel({
                name: "Light",
                id: LIGHT_ID,
                element: "deviceType",
                conformance: "M",
                constraint: "min 2",
            }),
        ),
        new ClusterModel({
            name: "OnOff",
            id: ON_OFF_ID,
            children: [
                featureMap,
                new AttributeModel({ name: "Pending", id: 0x7ff0, type: "bool", conformance: pending }),
            ],
        }),
        new ClusterModel({ name: "Singleton", id: SINGLETON_ID }),
    );
    model.finalize();
    return model;
}

/**
 * A model whose Composer2 requires one mandatory Light instance plus a second Light instance gated by
 * {@link GATE_CONDITION}, constrained to at most one endpoint. Composer3 requires an optional Light instance,
 * unconditionally, constrained to at most one endpoint.
 */
function checkCountFixtureModel() {
    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "RootNode", id: ROOT_ID, classification: "node" }),
        new DeviceTypeModel(
            { name: "Light", id: LIGHT_ID, classification: "simple" },
            new RequirementModel({ name: "OnOff", id: ON_OFF_ID, element: "serverCluster", conformance: "M" }),
        ),
        new DeviceTypeModel(
            { name: "Composer2", id: COMPOSER2_ID, classification: "simple" },
            new ConditionModel({ name: GATE_CONDITION }),
            new RequirementModel({
                name: "Light",
                id: LIGHT_ID,
                element: "deviceType",
                conformance: "M",
                instance: 1,
            }),
            new RequirementModel({
                name: "Light",
                id: LIGHT_ID,
                element: "deviceType",
                conformance: GATE_CONDITION,
                constraint: "max 1",
                instance: 2,
            }),
        ),
        new DeviceTypeModel(
            { name: "Composer3", id: COMPOSER3_ID, classification: "simple" },
            new RequirementModel({
                name: "Light",
                id: LIGHT_ID,
                element: "deviceType",
                conformance: "O",
                constraint: "max 1",
            }),
        ),
        new ClusterModel({ name: "OnOff", id: ON_OFF_ID, children: [FeatureMap.clone()] }),
    );
    model.finalize();
    return model;
}

/**
 * A model whose Composer4 requires {@link choice} of Light, by conformance {@link light}, and Plug, under
 * {@link GATE_CONDITION} and with the Lighting feature on its OnOff.
 * Composer5 requires, listed first, an optional Light instance of at least two endpoints whose OnOff has the Lighting
 * feature, then a mandatory Light instance whose OnOff has the Lighting feature and a Light instance of conformance
 * {@link third} with no nested requirement. Composer6 requires exactly one of Light and Plug: Light by a tolerated
 * instance of at most one endpoint listed before an optional one of at least two, and by an optional instance of at
 * least three outside the choice; Plug by an optional instance listed before a tolerated one of at most one endpoint.
 */
function perInstanceFixtureModel({
    light = "O",
    choice = "a",
    third = GATE_CONDITION,
}: { light?: string; choice?: string; third?: string } = {}) {
    const featureMap = FeatureMap.clone();
    featureMap.children = [new FieldModel({ name: "LT", title: "Lighting", constraint: "0" })];
    const onOff = () =>
        new RequirementModel({ name: "OnOff", id: ON_OFF_ID, element: "serverCluster", conformance: "M" });
    const lighting = () =>
        new RequirementModel(
            { name: "OnOff", id: ON_OFF_ID, element: "serverCluster", conformance: "M" },
            new RequirementModel({ name: "LT", element: "feature", conformance: "M" }),
        );

    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "RootNode", id: ROOT_ID, classification: "node" }),
        new DeviceTypeModel({ name: "Light", id: LIGHT_ID, classification: "simple" }, onOff()),
        new DeviceTypeModel({ name: "Plug", id: PLUG_ID, classification: "simple" }, onOff()),
        new DeviceTypeModel(
            { name: "Composer4", id: COMPOSER4_ID, classification: "simple" },
            new ConditionModel({ name: GATE_CONDITION }),
            new RequirementModel({
                name: "Light",
                id: LIGHT_ID,
                element: "deviceType",
                conformance: `${light}.${choice}`,
            }),
            new RequirementModel(
                { name: "Plug", id: PLUG_ID, element: "deviceType", conformance: `${GATE_CONDITION}.${choice}` },
                lighting(),
            ),
        ),
        new DeviceTypeModel(
            { name: "Composer5", id: COMPOSER5_ID, classification: "simple" },
            new ConditionModel({ name: GATE_CONDITION }),
            new RequirementModel(
                {
                    name: "Light",
                    id: LIGHT_ID,
                    element: "deviceType",
                    conformance: "O",
                    constraint: "min 2",
                    instance: 1,
                },
                lighting(),
            ),
            new RequirementModel(
                { name: "Light", id: LIGHT_ID, element: "deviceType", conformance: "M", instance: 2 },
                lighting(),
            ),
            new RequirementModel({
                name: "Light",
                id: LIGHT_ID,
                element: "deviceType",
                conformance: third,
                instance: 3,
            }),
        ),
        new DeviceTypeModel(
            { name: "Composer6", id: COMPOSER6_ID, classification: "simple" },
            new ConditionModel({ name: GATE_CONDITION }),
            new RequirementModel({
                name: "Light",
                id: LIGHT_ID,
                element: "deviceType",
                conformance: `${GATE_CONDITION}.b`,
                constraint: "max 1",
                instance: 1,
            }),
            new RequirementModel({
                name: "Light",
                id: LIGHT_ID,
                element: "deviceType",
                conformance: "O.b",
                constraint: "min 2",
                instance: 2,
            }),
            new RequirementModel({
                name: "Light",
                id: LIGHT_ID,
                element: "deviceType",
                conformance: "O",
                constraint: "min 3",
                instance: 3,
            }),
            new RequirementModel({ name: "Plug", id: PLUG_ID, element: "deviceType", conformance: "O.b", instance: 1 }),
            new RequirementModel({
                name: "Plug",
                id: PLUG_ID,
                element: "deviceType",
                conformance: `${GATE_CONDITION}.b`,
                constraint: "max 1",
                instance: 2,
            }),
        ),
        new ClusterModel({ name: "OnOff", id: ON_OFF_ID, children: [featureMap] }),
    );
    model.finalize();
    return model;
}

/**
 * The OnOff server of an endpoint, as the endpoint implements it.
 */
function onOffOf(model: MatterModel, supportedFeatures: { [name: string]: boolean } = {}) {
    const cluster = model.clusters(ON_OFF_ID);
    if (cluster === undefined) {
        throw new ImplementationError("Fixture model lacks OnOff");
    }
    const variant = cluster.clone();
    variant.supportedFeatures = supportedFeatures;
    return variant;
}

function singletonOf(model: MatterModel) {
    const cluster = model.clusters(SINGLETON_ID);
    if (cluster === undefined) {
        throw new ImplementationError("Fixture model lacks Singleton");
    }
    return cluster;
}

function kindsOf(violations: DeviceTypeViolation[]) {
    return violations.map(({ kind, requirement }) => [kind, requirement]);
}

describe("DeviceTypeConformance with facts that are not a node", () => {
    it("reports a mandatory server cluster that is missing and accepts it when present", () => {
        const model = fixtureModel();
        const root = endpoint("root", ROOT_ID);
        const bare = endpoint("bare", LIGHT_ID, { parent: root });
        const equipped = endpoint("equipped", LIGHT_ID, { parent: root, servers: [onOffOf(model)] });
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);

        expect(kindsOf(DeviceTypeConformance.check(bare, pass))).deep.equals([["missing", "OnOff"]]);
        expect(DeviceTypeConformance.check(equipped, pass)).deep.equals([]);
    });

    it("reports a feature a feature term disallows but not one only a condition disallows", () => {
        const byFeature = fixtureModel({ lighting: "OFFONLY" });
        const byFeatureRoot = endpoint("root", ROOT_ID);
        const byFeatureLight = endpoint("light", LIGHT_ID, {
            parent: byFeatureRoot,
            servers: [onOffOf(byFeature, { LT: true })],
        });

        expect(
            kindsOf(
                DeviceTypeConformance.check(byFeatureLight, new DeviceTypeValidationPass(new FakeFacts(), byFeature)),
            ),
        ).deep.equals([["disallowed", "OnOff.LT"]]);

        const byCondition = fixtureModel({ lighting: "Wanted | OFFONLY" });
        const byConditionRoot = endpoint("root", ROOT_ID);
        const byConditionLight = endpoint("light", LIGHT_ID, {
            parent: byConditionRoot,
            servers: [onOffOf(byCondition, { LT: true })],
        });

        expect(
            DeviceTypeConformance.check(byConditionLight, new DeviceTypeValidationPass(new FakeFacts(), byCondition)),
        ).deep.equals([]);
    });

    it("does not report a mandatory element its own definition marks provisional as missing", () => {
        const provisional = fixtureModel({ pending: "P, O" });
        const provisionalLight = endpoint("light", LIGHT_ID, {
            parent: endpoint("root", ROOT_ID),
            servers: [onOffOf(provisional)],
        });
        expect(
            DeviceTypeConformance.check(provisionalLight, new DeviceTypeValidationPass(new FakeFacts(), provisional)),
        ).deep.equals([]);

        const optional = fixtureModel({ pending: "O" });
        const optionalLight = endpoint("light", LIGHT_ID, {
            parent: endpoint("root", ROOT_ID),
            servers: [onOffOf(optional)],
        });
        expect(
            kindsOf(
                DeviceTypeConformance.check(optionalLight, new DeviceTypeValidationPass(new FakeFacts(), optional)),
            ),
        ).deep.equals([["missing", "OnOff.Pending"]]);

        const [onOff] = optionalLight.servers;
        optionalLight.elements.set(onOff, { attributes: new Set(["pending"]), commands: new Set(), events: new Set() });
        expect(
            DeviceTypeConformance.check(optionalLight, new DeviceTypeValidationPass(new FakeFacts(), optional)),
        ).deep.equals([]);
    });

    it("reports a component device type with fewer endpoints than its constraint requires", () => {
        const model = fixtureModel();
        const root = endpoint("root", ROOT_ID);
        const lonely = endpoint("lonely", COMPOSER_ID, { parent: root });
        endpoint("light", LIGHT_ID, { parent: lonely, servers: [onOffOf(model)] });
        const complete = endpoint("complete", COMPOSER_ID, { parent: root });
        endpoint("light1", LIGHT_ID, { parent: complete, servers: [onOffOf(model)] });
        endpoint("light2", LIGHT_ID, { parent: complete, servers: [onOffOf(model)] });
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);

        const found = DeviceTypeConformance.check(lonely, pass);
        expect(kindsOf(found)).deep.equals([["instanceCount", "device:Light"]]);
        expect(found[0].detail).equals(
            "Component device type Light requires min 2 endpoint(s) in the composition; found 1",
        );
        expect(DeviceTypeConformance.check(complete, pass)).deep.equals([]);
    });

    it("applies a component instance's count range only while that instance itself applies", () => {
        const model = checkCountFixtureModel();
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);

        const root = endpoint("root", ROOT_ID);
        const ungated = endpoint("ungated", COMPOSER2_ID, { parent: root });
        endpoint("light1", LIGHT_ID, { parent: ungated, servers: [onOffOf(model)] });
        endpoint("light2", LIGHT_ID, { parent: ungated, servers: [onOffOf(model)] });
        expect(DeviceTypeConformance.check(ungated, pass)).deep.equals([]);

        const gated = endpoint("gated", COMPOSER2_ID, { parent: root, stated: [GATE_CONDITION] });
        endpoint("light3", LIGHT_ID, { parent: gated, servers: [onOffOf(model)] });
        endpoint("light4", LIGHT_ID, { parent: gated, servers: [onOffOf(model)] });
        const found = DeviceTypeConformance.check(gated, pass);
        expect(kindsOf(found)).deep.equals([["instanceCount", "device:Light"]]);
        expect(found[0].detail).equals(
            "Component device type Light requires max 1 endpoint(s) in the composition; found 2",
        );
    });

    it("applies an optional component instance's own count range", () => {
        const model = checkCountFixtureModel();
        const root = endpoint("root", ROOT_ID);
        const composer3 = endpoint("composer3", COMPOSER3_ID, { parent: root });
        endpoint("light1", LIGHT_ID, { parent: composer3, servers: [onOffOf(model)] });
        endpoint("light2", LIGHT_ID, { parent: composer3, servers: [onOffOf(model)] });

        const found = DeviceTypeConformance.check(composer3, new DeviceTypeValidationPass(new FakeFacts(), model));
        expect(kindsOf(found)).deep.equals([["instanceCount", "device:Light"]]);
        expect(found[0].detail).equals(
            "Component device type Light requires max 1 endpoint(s) in the composition; found 2",
        );
    });

    it("judges a choice only over the members whose own requirement applies", () => {
        const model = perInstanceFixtureModel();
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);
        const root = endpoint("root", ROOT_ID);

        const ungated = endpoint("ungated", COMPOSER4_ID, { parent: root });
        endpoint("light1", LIGHT_ID, { parent: ungated, servers: [onOffOf(model)] });
        endpoint("plug1", PLUG_ID, { parent: ungated, servers: [onOffOf(model)] });
        expect(DeviceTypeConformance.check(ungated, pass)).deep.equals([]);

        const gated = endpoint("gated", COMPOSER4_ID, { parent: root, stated: [GATE_CONDITION] });
        endpoint("light2", LIGHT_ID, { parent: gated, servers: [onOffOf(model)] });
        endpoint("plug2", PLUG_ID, { parent: gated, servers: [onOffOf(model, { lighting: true })] });
        const found = DeviceTypeConformance.check(gated, pass);
        expect(kindsOf(found)).deep.equals([["instanceCount", "device:Light|Plug"]]);
        expect(found[0].detail).equals("Requires exactly 1 of component device types Light, Plug; found 2");
    });

    it("counts a choice member only a condition decides as a filler that is never needed", () => {
        const model = perInstanceFixtureModel();
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);
        const root = endpoint("root", ROOT_ID);

        const plugOnly = endpoint("plugOnly", COMPOSER4_ID, { parent: root });
        const plug1 = endpoint("plug1", PLUG_ID, { parent: plugOnly, servers: [onOffOf(model)] });
        expect(DeviceTypeConformance.check(plugOnly, pass)).deep.equals([]);
        expect(DeviceTypeConformance.check(plug1, pass)).deep.equals([]);

        const empty = endpoint("empty", COMPOSER4_ID, { parent: root });
        expect(DeviceTypeConformance.check(empty, pass).map(({ detail }) => detail)).deep.equals([
            "Requires exactly 1 of component device types Light, Plug; found 0",
        ]);

        const gated = endpoint("gated", COMPOSER4_ID, { parent: root, stated: [GATE_CONDITION] });
        endpoint("plug2", PLUG_ID, { parent: gated, servers: [onOffOf(model, { lighting: true })] });
        expect(DeviceTypeConformance.check(gated, pass)).deep.equals([]);
    });

    it("lets a tolerated member fill an at-least choice and does not judge a choice no member of which applies", () => {
        const root = endpoint("root", ROOT_ID);

        const orMore = perInstanceFixtureModel({ choice: "a+" });
        const plugOnly = endpoint("plugOnly", COMPOSER4_ID, { parent: root });
        endpoint("plug1", PLUG_ID, { parent: plugOnly, servers: [onOffOf(orMore)] });
        expect(
            DeviceTypeConformance.check(plugOnly, new DeviceTypeValidationPass(new FakeFacts(), orMore)),
        ).deep.equals([]);

        const tolerated = perInstanceFixtureModel({ light: GATE_CONDITION });
        const empty = endpoint("empty", COMPOSER4_ID, { parent: root });
        expect(
            DeviceTypeConformance.check(empty, new DeviceTypeValidationPass(new FakeFacts(), tolerated)),
        ).deep.equals([]);
    });

    it("judges a choice member by the ranges of its applying choice requirements only", () => {
        const model = perInstanceFixtureModel();
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);
        const root = endpoint("root", ROOT_ID);

        const twoLights = endpoint("twoLights", COMPOSER6_ID, { parent: root });
        for (const name of ["light1", "light2"]) {
            endpoint(name, LIGHT_ID, { parent: twoLights, servers: [onOffOf(model)] });
        }
        expect(DeviceTypeConformance.check(twoLights, pass).map(({ detail }) => detail)).deep.equals([
            "Component device type Light requires min 3 endpoint(s) in the composition; found 2",
        ]);

        const oneLight = endpoint("oneLight", COMPOSER6_ID, { parent: root });
        endpoint("light3", LIGHT_ID, { parent: oneLight, servers: [onOffOf(model)] });
        expect(DeviceTypeConformance.check(oneLight, pass).map(({ detail }) => detail)).deep.equals([
            "Component device type Light requires min 2 endpoint(s) in the composition; found 1",
            "Requires exactly 1 of component device types Light, Plug; found 0",
        ]);

        const twoPlugs = endpoint("twoPlugs", COMPOSER6_ID, { parent: root });
        for (const name of ["plug1", "plug2"]) {
            endpoint(name, PLUG_ID, { parent: twoPlugs, servers: [onOffOf(model)] });
        }
        expect(DeviceTypeConformance.check(twoPlugs, pass)).deep.equals([]);
    });

    it("reports a component endpoint that fills only an instance its requirement disallows", () => {
        const model = perInstanceFixtureModel({ third: "X" });
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);
        const root = endpoint("root", ROOT_ID);

        const composer = endpoint("composer", COMPOSER5_ID, { parent: root, stated: [GATE_CONDITION] });
        const plain = endpoint("plain", LIGHT_ID, { parent: composer, servers: [onOffOf(model)] });
        const found = DeviceTypeConformance.check(plain, pass);
        expect(kindsOf(found)).deep.equals([["missing", "device:Composer5/Light"]]);
        expect(found[0].detail).equals(
            "Endpoint is component Light of Composer5 composer but satisfies none of its instances; instance 1, the closest, fails OnOff.LT",
        );
    });

    it("does not report a component endpoint that fills an instance only a condition decides", () => {
        const model = perInstanceFixtureModel();
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);
        const root = endpoint("root", ROOT_ID);

        const ungated = endpoint("ungated", COMPOSER5_ID, { parent: root });
        const plain = endpoint("plain", LIGHT_ID, { parent: ungated, servers: [onOffOf(model)] });
        expect(DeviceTypeConformance.check(plain, pass)).deep.equals([]);

        const gated = endpoint("gated", COMPOSER5_ID, { parent: root, stated: [GATE_CONDITION] });
        const gatedPlain = endpoint("gatedPlain", LIGHT_ID, { parent: gated, servers: [onOffOf(model)] });
        expect(DeviceTypeConformance.check(gatedPlain, pass)).deep.equals([]);
    });

    it("applies an optional instance's count range only once the component has an endpoint", () => {
        const model = perInstanceFixtureModel();
        const empty = endpoint("empty", COMPOSER5_ID, { parent: endpoint("root", ROOT_ID) });

        const found = DeviceTypeConformance.check(empty, new DeviceTypeValidationPass(new FakeFacts(), model));
        expect(found.map(({ detail }) => detail)).deep.equals([
            "Component device type Light requires min 1 endpoint(s) in the composition; found 0",
        ]);
    });

    it("reports a singleton of the node endpoint on another endpoint of its node scope", () => {
        const model = fixtureModel();
        const root = endpoint("root", ROOT_ID, { servers: [singletonOf(model)] });
        const light = endpoint("light", LIGHT_ID, { parent: root, servers: [onOffOf(model), singletonOf(model)] });
        const facts = new FakeFacts();

        const misplaced = DeviceTypeConformance.misplacedSingletons(root, new DeviceTypeValidationPass(facts, model));
        expect([...misplaced.keys()].map(({ name }) => name)).deep.equals(["light"]);
        expect(
            [...misplaced.values()].flat().map(({ deviceType, kind, requirement }) => [deviceType, kind, requirement]),
        ).deep.equals([["RootNode", "singletonMisplaced", "Singleton"]]);

        const pass = new DeviceTypeValidationPass(facts, model);
        expect(kindsOf(DeviceTypeConformance.check(light, pass))).deep.equals([["singletonMisplaced", "Singleton"]]);
        expect(DeviceTypeConformance.check(root, pass)).deep.equals([]);
    });

    it("takes the node conditions the facts state for every endpoint of the node scope", () => {
        const model = fixtureModel();
        const root = endpoint("root", ROOT_ID);
        const light = endpoint("light", LIGHT_ID, { parent: root, servers: [onOffOf(model)] });
        const facts = new FakeFacts();

        expect(
            ConditionAssertions.collect(root, new DeviceTypeValidationPass(facts, model))
                .conditionsOf(light)
                .has(NodeCondition.CustomNetworkConfig),
        ).false;

        facts.nodeConditions.push(NodeCondition.CustomNetworkConfig);
        expect(
            ConditionAssertions.collect(root, new DeviceTypeValidationPass(facts, model))
                .conditionsOf(light)
                .has(NodeCondition.CustomNetworkConfig),
        ).true;
    });
});

/**
 * An index answering from fixed lists rather than the tree.
 */
class FakeIndex implements DeviceTypeScopeIndex<FakeEndpoint> {
    reaching = new Array<FakeEndpoint>();
    listings = new Map<number, FakeEndpoint[]>();

    reachingOf() {
        return new ReachingEndpoints(this.reaching);
    }

    scopeListing(): FakeEndpoint[] {
        throw new ImplementationError("Fake index keeps no scope listing");
    }

    partsListing(_parent: FakeEndpoint, deviceTypeId: number) {
        return this.listings.get(deviceTypeId) ?? [];
    }
}

describe("DeviceTypeValidationPass with a scope index", () => {
    it("reads the singleton declarers of a node scope from the index", () => {
        const model = fixtureModel();
        const root = endpoint("root", ROOT_ID);
        const light = endpoint("light", LIGHT_ID, { parent: root, servers: [onOffOf(model), singletonOf(model)] });
        const index = new FakeIndex();

        const misplaced = () =>
            DeviceTypeConformance.check(light, new DeviceTypeValidationPass(new FakeFacts(), model, index)).filter(
                ({ kind }) => kind === "singletonMisplaced",
            );

        expect(misplaced()).deep.equals([]);

        index.reaching.push(root);
        expect(misplaced().map(({ requirement }) => requirement)).deep.equals(["Singleton"]);
    });

    it("counts the siblings of the Duplicate condition from the index", () => {
        const model = fixtureModel();
        const root = endpoint("root", ROOT_ID);
        const first = endpoint("first", LIGHT_ID, { parent: root });
        const second = endpoint("second", LIGHT_ID, { parent: root });
        const index = new FakeIndex();

        const isDuplicate = () => new DeviceTypeValidationPass(new FakeFacts(), model, index).isDuplicate(first);

        index.listings.set(LIGHT_ID, [first]);
        expect(isDuplicate()).false;

        index.listings.set(LIGHT_ID, [first, second]);
        expect(isDuplicate()).true;

        const facts = new FakeFacts();
        facts.absent.add(second);
        expect(new DeviceTypeValidationPass(facts, model, index).isDuplicate(first)).false;
        expect(new DeviceTypeValidationPass(new FakeFacts(), model).isDuplicate(first)).true;
    });
});

describe("ReachingEndpoints", () => {
    it("reads a member's contribution again when it is added again", () => {
        const members = new ReachingEndpoints(["member"]);
        let interfaces = ["WiFi"];
        const read = () => ({ interfaces, declares: false });
        expect([...members.interfaceConditions(read)]).deep.equals(["WiFi"]);

        interfaces = ["Thread"];
        expect([...members.interfaceConditions(read)]).deep.equals(["WiFi"]);

        members.add("member");
        expect([...members.interfaceConditions(read)]).deep.equals(["Thread"]);
        expect(members.size).equals(1);
    });

    it("counts each member's contribution exactly once across a batch a read fails partway through", () => {
        const members = new ReachingEndpoints(["first", "second"]);
        let throwForSecond = true;
        const read = (member: string) => {
            if (member === "second" && throwForSecond) {
                throw new Error("boom");
            }
            return { interfaces: member === "first" ? ["WiFi"] : [], declares: false };
        };

        expect(() => members.interfaceConditions(read)).throws("boom");

        throwForSecond = false;
        expect([...members.interfaceConditions(read)]).deep.equals(["WiFi"]);

        // deleting "first" must retract the one count the failed batch made
        members.delete("first");
        expect([...members.interfaceConditions(read)]).deep.equals([]);
    });

    it("counts each member's asserted conditions exactly once across a batch a read fails partway through", () => {
        const members = new ReachingEndpoints(["first", "second"]);
        let throwForSecond = true;
        const read = (member: string) => {
            if (member === "second" && throwForSecond) {
                throw new Error("boom");
            }
            return member === "first" ? ["Gated"] : [];
        };
        const nodeConditions = new Set<string>();

        expect(() => members.assertedConditions(nodeConditions, read)).throws("boom");

        throwForSecond = false;
        expect([...members.assertedConditions(nodeConditions, read)]).deep.equals(["Gated"]);

        // deleting "first" must retract the one count the failed batch made
        members.delete("first");
        expect([...members.assertedConditions(nodeConditions, read)]).deep.equals([]);
    });
});

describe("device type model lookups", () => {
    it("resolves a device type's conditions once per model, shared by every pass resolved in it", () => {
        const deviceType = Matter.deviceTypes("OnOffLight");
        if (deviceType === undefined) {
            throw new ImplementationError("The standard model has no OnOffLight");
        }

        // RequirementResolver.conditionsOf() allocates a new Map per call, so identity shows the second pass reused the
        // first pass's entry
        const first = conditionScopeOf(deviceType, new DeviceTypeValidationPass(new FakeFacts(), Matter));
        const second = conditionScopeOf(deviceType, new DeviceTypeValidationPass(new FakeFacts(), Matter));
        expect(second).equals(first);
    });

    it("spells every structural condition as Base declares it", () => {
        const base = Matter.deviceTypes("Base");
        const declared = new Set(base?.all(ConditionModel).map(condition => condition.name));

        for (const name of Object.values<string>(StructuralCondition)) {
            expect(declared.has(name), `Base declares ${name}`).true;
        }
    });
});

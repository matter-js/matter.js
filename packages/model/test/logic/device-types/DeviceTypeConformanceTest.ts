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
import { ImplementationError, InternalError } from "@matter/general";
import { endpoint, FakeEndpoint, FakeFacts, standardCluster, standardDeviceType } from "./fake-facts.js";

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

const SUPPLY_ID = 0xfff1_0020;
const PLANT_ID = 0xfff1_0021;
const OPTIONAL_PLANT_ID = 0xfff1_0022;
const LIGHT_PLANT_ID = 0xfff1_0023;
const HUB_ID = 0xfff1_0024;
const PAIR_PLANT_ID = 0xfff1_0025;

/**
 * A model with the utility device type Supply. Plant requires at least two Supplies, PairPlant at most two and OptionalPlant an
 * optional one, each with the Lighting feature on its OnOff; LightPlant requires a Light. Hub, a node device
 * type, requires an optional Supply with the Lighting feature too.
 */
function utilityComponentFixtureModel() {
    const featureMap = FeatureMap.clone();
    featureMap.children = [new FieldModel({ name: "LT", title: "Lighting", constraint: "0" })];
    const onOff = () =>
        new RequirementModel({ name: "OnOff", id: ON_OFF_ID, element: "serverCluster", conformance: "M" });
    const supply = (conformance: string, constraint?: string) =>
        new RequirementModel(
            { name: "Supply", id: SUPPLY_ID, element: "deviceType", conformance, constraint },
            new RequirementModel(
                { name: "OnOff", id: ON_OFF_ID, element: "serverCluster", conformance: "M" },
                new RequirementModel({ name: "LT", element: "feature", conformance: "M" }),
            ),
        );

    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "RootNode", id: ROOT_ID, classification: "node" }),
        new DeviceTypeModel({ name: "Hub", id: HUB_ID, classification: "node" }, supply("O")),
        new DeviceTypeModel({ name: "Supply", id: SUPPLY_ID, classification: "utility" }, onOff()),
        new DeviceTypeModel({ name: "Light", id: LIGHT_ID, classification: "simple" }, onOff()),
        new DeviceTypeModel({ name: "Plant", id: PLANT_ID, classification: "simple" }, supply("M", "min 2")),
        new DeviceTypeModel({ name: "PairPlant", id: PAIR_PLANT_ID, classification: "simple" }, supply("M", "max 2")),
        new DeviceTypeModel({ name: "OptionalPlant", id: OPTIONAL_PLANT_ID, classification: "simple" }, supply("O")),
        new DeviceTypeModel(
            { name: "LightPlant", id: LIGHT_PLANT_ID, classification: "simple" },
            new RequirementModel({ name: "Light", id: LIGHT_ID, element: "deviceType", conformance: "M" }),
        ),
        new ClusterModel({ name: "OnOff", id: ON_OFF_ID, children: [featureMap] }),
    );
    model.finalize();
    return model;
}

describe("DeviceTypeConformance with a utility component on the composing endpoint", () => {
    it("counts the composing endpoint when its own device type list declares the utility component", () => {
        const model = utilityComponentFixtureModel();
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);
        const root = endpoint("root", ROOT_ID);

        const alone = endpoint("alone", [PLANT_ID, SUPPLY_ID], {
            parent: root,
            servers: [onOffOf(model, { lighting: true })],
        });
        const found = DeviceTypeConformance.check(alone, pass);
        expect(kindsOf(found)).deep.equals([["instanceCount", "device:Supply"]]);
        expect(found[0].detail).equals(
            "Component device type Supply requires min 2 endpoint(s) in the composition; found 1",
        );

        const split = endpoint("split", [PLANT_ID, SUPPLY_ID], {
            parent: root,
            servers: [onOffOf(model, { lighting: true })],
        });
        endpoint("supply", SUPPLY_ID, { parent: split, servers: [onOffOf(model, { lighting: true })] });
        expect(DeviceTypeConformance.check(split, pass)).deep.equals([]);

        const crowded = endpoint("crowded", [PAIR_PLANT_ID, SUPPLY_ID], {
            parent: root,
            servers: [onOffOf(model, { lighting: true })],
        });
        for (const name of ["supply1", "supply2"]) {
            endpoint(name, SUPPLY_ID, { parent: crowded, servers: [onOffOf(model, { lighting: true })] });
        }
        expect(DeviceTypeConformance.check(crowded, pass).map(({ detail }) => detail)).deep.equals([
            "Component device type Supply requires max 2 endpoint(s) in the composition; found 3",
        ]);
    });

    it("judges the composing endpoint by the nested requirements of a utility component it declares", () => {
        const model = utilityComponentFixtureModel();
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);
        const root = endpoint("root", ROOT_ID);

        const plant = endpoint("plant", [OPTIONAL_PLANT_ID, SUPPLY_ID], { parent: root, servers: [onOffOf(model)] });
        const found = DeviceTypeConformance.check(plant, pass);
        expect(kindsOf(found)).deep.equals([["missing", "device:OptionalPlant/Supply"]]);
        expect(found[0].detail).equals("Endpoint is component Supply of OptionalPlant plant but fails OnOff.LT");

        const lit = endpoint("lit", [OPTIONAL_PLANT_ID, SUPPLY_ID], {
            parent: root,
            servers: [onOffOf(model, { lighting: true })],
        });
        expect(DeviceTypeConformance.check(lit, pass)).deep.equals([]);
    });

    it("judges a node endpoint by the nested requirements of a utility component it declares", () => {
        const model = utilityComponentFixtureModel();
        const hub = endpoint("hub", [HUB_ID, SUPPLY_ID], { servers: [onOffOf(model)] });

        const found = DeviceTypeConformance.check(hub, new DeviceTypeValidationPass(new FakeFacts(), model));
        expect(kindsOf(found)).deep.equals([["missing", "device:Hub/Supply"]]);
    });

    it("does not count the composing endpoint for a component that is not a utility device type", () => {
        const model = utilityComponentFixtureModel();
        const plant = endpoint("plant", [LIGHT_PLANT_ID, LIGHT_ID], {
            parent: endpoint("root", ROOT_ID),
            servers: [onOffOf(model)],
        });

        const found = DeviceTypeConformance.check(plant, new DeviceTypeValidationPass(new FakeFacts(), model));
        expect(found.map(({ detail }) => detail)).deep.equals([
            "Component device type Light requires min 1 endpoint(s) in the composition; found 0",
        ]);
    });

    it("finds the component counts of the Device Library examples met", () => {
        const [rootNode, powerSource, electricalSensor, energyManagement] = [
            "RootNode",
            "PowerSource",
            "ElectricalSensor",
            "DeviceEnergyManagement",
        ].map(standardDeviceType);
        const utilities = [powerSource, electricalSensor, energyManagement];
        const root = endpoint("root", rootNode);

        const heatPump = endpoint("heatPump", [standardDeviceType("HeatPump"), ...utilities], { parent: root });
        endpoint("flow", standardDeviceType("TemperatureSensor"), { parent: heatPump });
        endpoint("upstairs", standardDeviceType("Thermostat"), { parent: heatPump });
        const solarPower = endpoint("solarPower", [standardDeviceType("SolarPower"), ...utilities], { parent: root });
        const batteryStorage = endpoint("batteryStorage", [standardDeviceType("BatteryStorage"), ...utilities], {
            parent: root,
        });
        endpoint("battery", [powerSource, electricalSensor], { parent: batteryStorage });
        const meter = endpoint(
            "meter",
            [standardDeviceType("ElectricalMeter"), standardDeviceType("ElectricalEnergyTariff"), electricalSensor],
            { parent: root },
        );

        const pass = new DeviceTypeValidationPass(new FakeFacts(), Matter);
        for (const composing of [heatPump, solarPower, batteryStorage, meter]) {
            const counts = DeviceTypeConformance.check(composing, pass)
                .map(({ detail }) => detail)
                .filter(detail => detail.startsWith("Component device type"));
            expect(counts, composing.name).deep.equals([]);
        }
    });
});

const FED_HUB_ID = 0xfff1_0030;
const FEED_ID = 0xfff1_0031;
const FEEDER_ID = 0xfff1_0032;
const STRICT_ID = 0xfff1_0033;

/**
 * A model whose node device type Hub requires at most one Feed with the Lighting feature on its OnOff, mandatory under
 * its condition Fed, which Feeder asserts at the Root, and optional otherwise. Strict requires the same Feed whatever
 * holds.
 * Hub forbids the Lighting feature on its own optional OnOff.
 */
function rootAssertionFixtureModel() {
    const featureMap = FeatureMap.clone();
    featureMap.children = [new FieldModel({ name: "LT", title: "Lighting", constraint: "0" })];

    const model = new MatterModel(
        {},
        new DeviceTypeModel(
            { name: "Hub", id: FED_HUB_ID, classification: "node" },
            new ConditionModel({ name: "Fed" }),
            new RequirementModel(
                { name: "OnOff", id: ON_OFF_ID, element: "serverCluster", conformance: "O" },
                new RequirementModel({ name: "LT", element: "feature", conformance: "X" }),
            ),
            new RequirementModel(
                { name: "Feed", id: FEED_ID, element: "deviceType", conformance: "Fed, O", constraint: "max 1" },
                new RequirementModel(
                    { name: "OnOff", id: ON_OFF_ID, element: "serverCluster", conformance: "M" },
                    new RequirementModel({ name: "LT", element: "feature", conformance: "M" }),
                ),
            ),
        ),
        new DeviceTypeModel({ name: "Feed", id: FEED_ID, classification: "utility" }),
        new DeviceTypeModel(
            { name: "Strict", id: STRICT_ID, classification: "simple" },
            new RequirementModel(
                { name: "Feed", id: FEED_ID, element: "deviceType", conformance: "M" },
                new RequirementModel(
                    { name: "OnOff", id: ON_OFF_ID, element: "serverCluster", conformance: "M" },
                    new RequirementModel({ name: "LT", element: "feature", conformance: "M" }),
                ),
            ),
        ),
        new DeviceTypeModel(
            { name: "Feeder", id: FEEDER_ID, classification: "simple" },
            new RequirementModel({
                name: "Fed",
                type: "Hub.Fed",
                element: "condition",
                conformance: "M",
                location: "Root",
            }),
        ),
        new ClusterModel({ name: "OnOff", id: ON_OFF_ID, children: [featureMap] }),
    );
    model.finalize();
    return model;
}

describe("DeviceTypeConformance with conditions asserted at the Root", () => {
    it("keeps a disallowed element unflagged, as no condition disallows", () => {
        const model = rootAssertionFixtureModel();
        const hub = endpoint("hub", FED_HUB_ID, { servers: [onOffOf(model, { lighting: true })] });
        endpoint("feeder", FEEDER_ID, { parent: hub });

        const found = DeviceTypeConformance.check(hub, new DeviceTypeValidationPass(new FakeFacts(), model));
        const disallowed = found.find(({ kind }) => kind === "disallowed");
        expect(disallowed?.requirement).equals("OnOff.LT");
        expect(disallowed?.assertedAtRoot).undefined;
    });

    it("flags an unfilled component instance that only a Root assertion makes mandatory", () => {
        const model = rootAssertionFixtureModel();
        const hub = endpoint("hub", FED_HUB_ID);
        endpoint("feed", FEED_ID, { parent: hub, servers: [onOffOf(model)] });
        endpoint("feeder", FEEDER_ID, { parent: hub });

        const found = DeviceTypeConformance.check(hub, new DeviceTypeValidationPass(new FakeFacts(), model));
        expect(found.map(({ kind, requirement, assertedAtRoot }) => [kind, requirement, assertedAtRoot])).deep.equals([
            ["instanceCount", "device:Feed#1", true],
        ]);
    });

    it("does not flag a count the requirement violates also when optional", () => {
        const model = rootAssertionFixtureModel();
        const hub = endpoint("hub", FED_HUB_ID);
        endpoint("feed1", FEED_ID, { parent: hub, servers: [onOffOf(model, { lighting: true })] });
        endpoint("feed2", FEED_ID, { parent: hub, servers: [onOffOf(model, { lighting: true })] });
        endpoint("feeder", FEEDER_ID, { parent: hub });

        const found = DeviceTypeConformance.check(hub, new DeviceTypeValidationPass(new FakeFacts(), model));
        expect(found.map(({ kind, requirement, assertedAtRoot }) => [kind, requirement, assertedAtRoot])).deep.equals([
            ["instanceCount", "device:Feed", undefined],
        ]);
    });

    it("does not flag a violation another device type of the endpoint requires whatever holds", () => {
        const model = rootAssertionFixtureModel();
        const hub = endpoint("hub", [FED_HUB_ID, STRICT_ID]);
        endpoint("feed", FEED_ID, { parent: hub, servers: [onOffOf(model)] });
        endpoint("feeder", FEEDER_ID, { parent: hub });

        const found = DeviceTypeConformance.check(hub, new DeviceTypeValidationPass(new FakeFacts(), model));
        expect(
            found
                .filter(({ requirement }) => requirement === "device:Feed#1")
                .map(({ deviceType, assertedAtRoot }) => [deviceType, assertedAtRoot]),
        ).deep.equals([["Hub", undefined]]);
    });

    it("flags the node endpoint's violations that only a Root assertion makes mandatory", () => {
        const root = endpoint("root", standardDeviceType("RootNode"), {
            servers: [standardCluster("TimeSynchronization", {})],
        });
        endpoint("camera", standardDeviceType("Camera"), { parent: root });

        const found = DeviceTypeConformance.check(root, new DeviceTypeValidationPass(new FakeFacts(), Matter));
        const flagged = found.filter(({ assertedAtRoot }) => assertedAtRoot).map(({ requirement }) => requirement);
        expect(flagged).deep.equals([
            "TimeSynchronization.TSC",
            "TimeSynchronization.NTPC",
            "TimeSynchronization.TZ",
            "client:TimeSynchronization",
            "TlsCertificateManagement",
            "TlsClientManagement",
            "device:PowerSource",
        ]);
        expect(found.find(({ requirement }) => requirement === "BasicInformation")?.assertedAtRoot).undefined;
    });

    it("does not flag a requirement the node endpoint states the condition for itself", () => {
        const root = endpoint("root", standardDeviceType("RootNode"), { stated: ["PowerSourceCond"] });
        endpoint("camera", standardDeviceType("Camera"), { parent: root });

        const found = DeviceTypeConformance.check(root, new DeviceTypeValidationPass(new FakeFacts(), Matter));
        const powerSource = found.find(({ requirement }) => requirement === "device:PowerSource");
        expect(powerSource?.kind).equals("instanceCount");
        expect(powerSource?.assertedAtRoot).undefined;
    });
});

const BINDING_ID = 0x1e;
const TAGGED_ID = 0x7ff1;
const NETWORKED_ID = 0x7ff2;
const SWITCH_ID = 0xfff1_0010;
const UTILITY_ID = 0xfff1_0011;

/**
 * A model whose Base mandates Binding under `Simple & Client`, as the specification does, plus Tagged under
 * `Duplicate` and Networked under `CustomNetworkConfig`, which other endpoints and the node's configuration decide.
 */
function baseServersModel() {
    const model = new MatterModel(
        {},
        new DeviceTypeModel(
            { name: "Base", classification: "base" },
            ...["Simple", "Client", "Duplicate", "CustomNetworkConfig"].map(name => new ConditionModel({ name })),
            new RequirementModel({
                name: "Binding",
                id: BINDING_ID,
                element: "serverCluster",
                conformance: "Simple & Client",
            }),
            new RequirementModel({ name: "Tagged", id: TAGGED_ID, element: "serverCluster", conformance: "Duplicate" }),
            new RequirementModel({
                name: "Networked",
                id: NETWORKED_ID,
                element: "serverCluster",
                conformance: "CustomNetworkConfig",
            }),
        ),
        new DeviceTypeModel({ name: "RootNode", id: ROOT_ID, classification: "node" }),
        new DeviceTypeModel({ name: "Switch", id: SWITCH_ID, classification: "simple" }),
        new DeviceTypeModel({ name: "Utility", id: UTILITY_ID, classification: "utility" }),
        new ClusterModel({ name: "Binding", id: BINDING_ID }),
        new ClusterModel({ name: "Tagged", id: TAGGED_ID }),
        new ClusterModel({ name: "Networked", id: NETWORKED_ID }),
        new ClusterModel({ name: "OnOff", id: ON_OFF_ID, classification: "application" }),
        new ClusterModel({ name: "Identify", id: 3, classification: "endpoint" }),
    );
    model.finalize();
    return model;
}

/**
 * Facts that record the endpoints whose device types or clusters a judgement reads.
 */
class ReadRecordingFacts extends FakeFacts {
    read = new Set<FakeEndpoint>();

    override deviceTypeIdsOf(endpoint: FakeEndpoint) {
        this.read.add(endpoint);
        return super.deviceTypeIdsOf(endpoint);
    }

    override serverClustersOf(endpoint: FakeEndpoint) {
        this.read.add(endpoint);
        return super.serverClustersOf(endpoint);
    }

    override clientClustersOf(endpoint: FakeEndpoint) {
        this.read.add(endpoint);
        return super.clientClustersOf(endpoint);
    }
}

describe("DeviceTypeConformance.missingBaseServersOf", () => {
    const model = baseServersModel();
    const cluster = (id: number) => model.clusters(id)!;

    function missingOf(target: FakeEndpoint, facts = new FakeFacts()) {
        const pass = new DeviceTypeValidationPass(facts, model);
        const missing = DeviceTypeConformance.missingBaseServersOf(target, pass).map(({ name }) => name);

        // The same judgement check reports
        expect(
            DeviceTypeConformance.check(target, new DeviceTypeValidationPass(facts, model))
                .filter(({ deviceType, kind }) => deviceType === "Base" && kind === "missing")
                .map(({ requirement }) => requirement),
        ).deep.equals(missing);

        return missing;
    }

    it("names Binding for a simple endpoint with an application client", () => {
        const root = endpoint("root", ROOT_ID);
        const target = endpoint("switch", SWITCH_ID, { parent: root, clients: [cluster(ON_OFF_ID)] });

        expect(missingOf(target)).deep.equals(["Binding"]);
    });

    it("names Binding for a simple endpoint whose application client is an extension", () => {
        const root = endpoint("root", ROOT_ID);
        const target = endpoint("switch", SWITCH_ID, { parent: root, clients: [cluster(ON_OFF_ID).extend()] });

        expect(missingOf(target)).deep.equals(["Binding"]);
    });

    it("counts an extended application server for the Server condition", () => {
        const root = endpoint("root", ROOT_ID);
        const target = endpoint("switch", SWITCH_ID, { parent: root, servers: [cluster(ON_OFF_ID).extend()] });

        expect(
            ConditionAssertions.ownConditionsOf(target, new DeviceTypeValidationPass(new FakeFacts(), model)).has(
                StructuralCondition.Server,
            ),
        ).true;
    });

    it("names nothing for a simple endpoint that carries Binding", () => {
        const root = endpoint("root", ROOT_ID);
        const target = endpoint("switch", SWITCH_ID, {
            parent: root,
            servers: [cluster(BINDING_ID)],
            clients: [cluster(ON_OFF_ID)],
        });

        expect(missingOf(target)).deep.equals([]);
    });

    it("names nothing for a simple endpoint whose only client is a utility cluster", () => {
        const root = endpoint("root", ROOT_ID);
        const target = endpoint("switch", SWITCH_ID, { parent: root, clients: [cluster(3)] });

        expect(missingOf(target)).deep.equals([]);
    });

    it("names nothing for a utility endpoint with an application client", () => {
        const root = endpoint("root", ROOT_ID);
        const target = endpoint("utility", UTILITY_ID, { parent: root, clients: [cluster(ON_OFF_ID)] });

        expect(missingOf(target)).deep.equals([]);
    });

    it("names nothing for an endpoint of a device type the model does not define", () => {
        const root = endpoint("root", ROOT_ID);
        const target = endpoint("custom", 0xfff1_00ff, {
            parent: root,
            clients: [cluster(ON_OFF_ID)],
            stated: ["Simple"],
        });

        expect(missingOf(target)).deep.equals([]);
    });

    it("judges an endpoint outside its node scope under no condition", () => {
        const root = endpoint("root", ROOT_ID);
        const parent = endpoint("parent", SWITCH_ID, { parent: root });
        const target = endpoint("switch", SWITCH_ID, { parent, clients: [cluster(ON_OFF_ID)] });
        const facts = new FakeFacts();
        facts.absent.add(parent);

        expect(missingOf(target, facts)).deep.equals([]);
    });

    it("names a requirement a stated condition makes mandatory", () => {
        const root = endpoint("root", ROOT_ID);
        const target = endpoint("utility", UTILITY_ID, {
            parent: root,
            clients: [cluster(ON_OFF_ID)],
            stated: ["Simple"],
        });

        expect(missingOf(target)).deep.equals(["Binding"]);
    });

    it("judges a condition siblings decide from the node scope", () => {
        const root = endpoint("root", ROOT_ID);
        const first = endpoint("first", SWITCH_ID, { parent: root });
        endpoint("second", SWITCH_ID, { parent: root });

        expect(missingOf(first)).deep.equals(["Tagged"]);
    });

    it("judges a condition the node's configuration decides", () => {
        const root = endpoint("root", ROOT_ID);
        const target = endpoint("switch", SWITCH_ID, { parent: root });
        const facts = new FakeFacts();
        facts.nodeConditions.push(NodeCondition.CustomNetworkConfig);

        expect(missingOf(target, facts)).deep.equals(["Networked"]);
    });

    it("reads no sibling for a requirement whose conditions the endpoint decides", () => {
        const onlyBinding = new MatterModel(
            {},
            new DeviceTypeModel(
                { name: "Base", classification: "base" },
                ...["Simple", "Client"].map(name => new ConditionModel({ name })),
                new RequirementModel({
                    name: "Binding",
                    id: BINDING_ID,
                    element: "serverCluster",
                    conformance: "Simple & Client",
                }),
            ),
            new DeviceTypeModel({ name: "RootNode", id: ROOT_ID, classification: "node" }),
            new DeviceTypeModel({ name: "Switch", id: SWITCH_ID, classification: "simple" }),
            new ClusterModel({ name: "Binding", id: BINDING_ID }),
            new ClusterModel({ name: "OnOff", id: ON_OFF_ID, classification: "application" }),
        );
        onlyBinding.finalize();

        const root = endpoint("root", ROOT_ID);
        const siblings = [
            endpoint("first", SWITCH_ID, { parent: root }),
            endpoint("second", SWITCH_ID, { parent: root }),
        ];
        const target = endpoint("switch", SWITCH_ID, { parent: root, clients: [onlyBinding.clusters(ON_OFF_ID)!] });
        const facts = new ReadRecordingFacts();

        const missing = DeviceTypeConformance.missingBaseServersOf(
            target,
            new DeviceTypeValidationPass(facts, onlyBinding),
        );

        expect(missing.map(({ name }) => name)).deep.equals(["Binding"]);
        expect(siblings.filter(sibling => facts.read.has(sibling))).deep.equals([]);
    });

    it("treats every qualified condition name as undecided", () => {
        const pass = new DeviceTypeValidationPass(new FakeFacts(), model);

        expect(ConditionAssertions.isUndecided("Simple", pass)).false;
        expect(ConditionAssertions.isUndecided("CustomNetworkConfig", pass)).true;
        expect(ConditionAssertions.isUndecided("RootNode.CustomNetworkConfig", pass)).true;
        expect(ConditionAssertions.isUndecided("Switch.Simple", pass)).true;
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
                throw new InternalError("boom");
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
                throw new InternalError("boom");
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

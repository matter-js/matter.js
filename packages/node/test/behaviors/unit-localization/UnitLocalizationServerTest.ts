/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnitLocalizationServer } from "#behaviors/unit-localization";
import { Environment, LogLevel, MockStorageService, StorageService } from "@matter/general";
import { captureLog, causeMessagesOf, MockServerNode } from "@matter/node/testing";
import { Write } from "@matter/protocol";
import { EndpointNumber, Status } from "@matter/types";
import { UnitLocalization } from "@matter/types/clusters/unit-localization";
import { onlyStatus, writeAsController } from "../localization-write.js";

const { TempUnit } = UnitLocalization;

function rootWith(
    state: {
        supportedTemperatureUnits?: UnitLocalization.TempUnit[];
        temperatureUnit?: UnitLocalization.TempUnit;
    } = {},
) {
    return MockServerNode.RootEndpoint.with(UnitLocalizationServer.set(state));
}

function resetLines(log: ReturnType<typeof captureLog>) {
    return log.messages.filter(message => message.includes("is not in supportedTemperatureUnits"));
}

function expectOneReset(log: ReturnType<typeof captureLog>, from: string, to: string) {
    const lines = resetLines(log);
    expect(lines).length(1);
    expect(lines[0]).contains(" WARN ");
    expect(lines[0]).contains(`Temperature unit ${from} is not in supportedTemperatureUnits, using ${to}`);
}

function writeTemperatureUnit(node: MockServerNode, value: UnitLocalization.TempUnit) {
    return writeAsController(
        node,
        Write(
            Write.Attribute({
                endpoint: EndpointNumber(0),
                cluster: UnitLocalization,
                attributes: "temperatureUnit",
                value,
            }),
        ),
    );
}

describe("UnitLocalizationServer", () => {
    it("initializes", async () => {
        await using node = await MockServerNode.create(MockServerNode.RootEndpoint.with(UnitLocalizationServer));
        expect(node.state.unitLocalization.temperatureUnit).equals(UnitLocalization.TempUnit.Celsius);
        expect(node.state.unitLocalization.supportedTemperatureUnits).deep.equals([
            UnitLocalization.TempUnit.Celsius,
            UnitLocalization.TempUnit.Fahrenheit,
        ]);
    });

    // 11.5.6.1: "An attempt to write to this attribute with a value not included in the SupportedTemperatureUnits
    // attribute list SHALL result in a CONSTRAINT_ERROR."
    // Characterization: passes on the code before this change
    it("rejects a controller write of a unit outside SupportedTemperatureUnits with CONSTRAINT_ERROR", async () => {
        await using node = await MockServerNode.createOnline(rootWith());

        expect(onlyStatus(await writeTemperatureUnit(node, TempUnit.Kelvin))).equals(Status.ConstraintError);
        expect(node.state.unitLocalization.temperatureUnit).equals(TempUnit.Celsius);
    });

    // Characterization: passes on the code before this change
    it("accepts a controller write of a unit in SupportedTemperatureUnits", async () => {
        await using node = await MockServerNode.createOnline(rootWith());

        expect(onlyStatus(await writeTemperatureUnit(node, TempUnit.Fahrenheit))).equals(Status.Success);
        expect(node.state.unitLocalization.temperatureUnit).equals(TempUnit.Fahrenheit);
    });

    // 11.5.6: SupportedTemperatureUnits constraint "2 to 3"
    it("refuses a SupportedTemperatureUnits list with a single entry", async () => {
        const messages = await causeMessagesOf(
            MockServerNode.create(rootWith({ supportedTemperatureUnits: [TempUnit.Celsius] })),
        );

        expect(messages).contains('Constraint "2 to 3"');
    });

    it("replaces a configured TemperatureUnit that is not in the configured SupportedTemperatureUnits", async () => {
        using log = captureLog(LogLevel.WARN);

        await using node = await MockServerNode.create(
            rootWith({
                temperatureUnit: TempUnit.Kelvin,
                supportedTemperatureUnits: [TempUnit.Fahrenheit, TempUnit.Celsius],
            }),
        );

        expect(node.state.unitLocalization.temperatureUnit).equals(TempUnit.Celsius);
        expectOneReset(log, "Kelvin", "Celsius");
    });

    // Characterization: passes on the code before this change
    it("logs nothing about a reset on a first start without a TemperatureUnit", async () => {
        using log = captureLog(LogLevel.WARN);

        await using _node = await MockServerNode.create(
            rootWith({ supportedTemperatureUnits: [TempUnit.Fahrenheit, TempUnit.Kelvin] }),
        );

        expect(resetLines(log)).deep.equals([]);
    });

    // 11.5.6.1 requires TemperatureUnit to be in SupportedTemperatureUnits only for writes. That the same holds at
    // startup is matter.js's choice, so a default outside the list is replaced.
    it("starts with a supported unit when Celsius is not in the configured SupportedTemperatureUnits", async () => {
        await using node = await MockServerNode.create(
            rootWith({ supportedTemperatureUnits: [TempUnit.Fahrenheit, TempUnit.Kelvin] }),
        );

        expect(node.state.unitLocalization.temperatureUnit).equals(TempUnit.Fahrenheit);
        expect(node.state.unitLocalization.supportedTemperatureUnits).deep.equals([
            TempUnit.Fahrenheit,
            TempUnit.Kelvin,
        ]);
    });

    // Characterization: passes on the code before this change
    it("keeps Celsius as the default when it is in the configured SupportedTemperatureUnits but not first", async () => {
        await using node = await MockServerNode.create(
            rootWith({ supportedTemperatureUnits: [TempUnit.Fahrenheit, TempUnit.Celsius] }),
        );

        expect(node.state.unitLocalization.temperatureUnit).equals(TempUnit.Celsius);
    });

    // Characterization: passes on the code before this change
    it("keeps a written TemperatureUnit across a restart", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));
        const root = rootWith();

        {
            await using node = await MockServerNode.createOnline(root, { id: "unit", environment });
            expect(onlyStatus(await writeTemperatureUnit(node, TempUnit.Fahrenheit))).equals(Status.Success);
        }

        {
            await using node = await MockServerNode.createOnline(root, { id: "unit", environment });
            expect(node.state.unitLocalization.temperatureUnit).equals(TempUnit.Fahrenheit);
        }
    });

    it("starts with a supported unit when the stored TemperatureUnit is no longer in SupportedTemperatureUnits", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));

        {
            const root = rootWith({ supportedTemperatureUnits: [TempUnit.Celsius, TempUnit.Fahrenheit] });
            await using node = await MockServerNode.createOnline(root, { id: "unit", environment });
            expect(onlyStatus(await writeTemperatureUnit(node, TempUnit.Fahrenheit))).equals(Status.Success);
        }

        {
            using log = captureLog(LogLevel.WARN);
            const root = rootWith({ supportedTemperatureUnits: [TempUnit.Kelvin, TempUnit.Celsius] });
            await using node = await MockServerNode.createOnline(root, { id: "unit", environment });
            expect(node.state.unitLocalization.temperatureUnit).equals(TempUnit.Celsius);
            expectOneReset(log, "Fahrenheit", "Celsius");
        }
    });
});

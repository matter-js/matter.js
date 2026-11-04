/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeFormatLocalizationServer } from "#behaviors/time-format-localization";
import { ServerNode } from "#node/ServerNode.js";
import { Environment, LogLevel, MockStorageService, StorageService } from "@matter/general";
import { captureLog, MockServerNode } from "@matter/node/testing";
import { ConstraintError, Write } from "@matter/protocol";
import { EndpointNumber, Status } from "@matter/types";
import { TimeFormatLocalization } from "@matter/types/clusters/time-format-localization";
import { onlyStatus, writeAsController } from "../localization-write.js";

const { CalendarType, HourFormat } = TimeFormatLocalization;
type CalendarType = TimeFormatLocalization.CalendarType;
type HourFormat = TimeFormatLocalization.HourFormat;

/** Server whose detected hour format and calendar do not depend on the machine running the test */
class DetectingServer extends TimeFormatLocalizationServer {
    override get detectedHourFormat(): TimeFormatLocalizationServer["detectedHourFormat"] {
        return HourFormat["24Hr"];
    }

    override get detectedCalendarType(): TimeFormatLocalizationServer["detectedCalendarType"] {
        return CalendarType.Gregorian;
    }
}

function rootWith(state: { supportedCalendarTypes?: CalendarType[]; activeCalendarType?: CalendarType } = {}) {
    return MockServerNode.RootEndpoint.with(DetectingServer.set(state));
}

function resetLines(log: ReturnType<typeof captureLog>) {
    return log.messages.filter(message => message.includes("is not in supportedCalendarTypes"));
}

function expectOneReset(log: ReturnType<typeof captureLog>, from: string, to: string) {
    const lines = resetLines(log);
    expect(lines).length(1);
    expect(lines[0]).contains(" WARN ");
    expect(lines[0]).contains(`Active calendar type ${from} is not in supportedCalendarTypes, using ${to}`);
}

function writeAttribute(
    node: MockServerNode,
    attributes: "hourFormat" | "activeCalendarType",
    value: HourFormat | CalendarType,
) {
    return writeAsController(
        node,
        Write(Write.Attribute({ endpoint: EndpointNumber(0), cluster: TimeFormatLocalization, attributes, value })),
    );
}

function createEndpoint() {
    return MockServerNode.create(
        ServerNode.RootEndpoint.with(
            TimeFormatLocalizationServer.with("CalendarFormat").set({
                supportedCalendarTypes: [
                    TimeFormatLocalization.CalendarType.Buddhist,
                    TimeFormatLocalization.CalendarType.Chinese,
                    TimeFormatLocalization.CalendarType.Coptic,
                ],
                hourFormat: TimeFormatLocalization.HourFormat["24Hr"],
                activeCalendarType: TimeFormatLocalization.CalendarType.Coptic,
            }),
        ),
    );
}

describe("TimeFormatLocalizationServer", () => {
    it("starts without the CalendarFormat feature", async () => {
        const node = await MockServerNode.create(MockServerNode.RootEndpoint.with(DetectingServer.with()));
        expect(node.stateOf(DetectingServer.with()).hourFormat).equals(HourFormat["24Hr"]);
        await node.close();
    });

    it("accepts valid date formats", async () => {
        await using endpoint = await createEndpoint();
        await endpoint.act(agent => {
            agent.timeFormatLocalization.state.activeCalendarType = TimeFormatLocalization.CalendarType.Chinese;
        });
    });

    it("rejects invalid date formats", async () => {
        await using endpoint = await createEndpoint();
        expect(() =>
            endpoint.act(agent => {
                agent.timeFormatLocalization.state.activeCalendarType = TimeFormatLocalization.CalendarType.Gregorian;
            }),
        ).throws(
            ConstraintError,
            'Validating node0.timeFormatLocalization.state: Constraint "in supportedCalendarTypes": Value 4 is not one of the values allowed by "in" constraint (135)',
        );
    });

    it("defaults to the detected hour format and calendar, listing the calendar as the only supported type", async () => {
        await using node = await MockServerNode.create(rootWith());

        expect(node.state.timeFormatLocalization.hourFormat).equals(HourFormat["24Hr"]);
        expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Gregorian);
        expect(node.state.timeFormatLocalization.supportedCalendarTypes).deep.equals([CalendarType.Gregorian]);
    });

    it("treats an explicitly undefined SupportedCalendarTypes as unset", async () => {
        await using node = await MockServerNode.create(rootWith({ supportedCalendarTypes: undefined }));

        expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Gregorian);
        expect(node.state.timeFormatLocalization.supportedCalendarTypes).deep.equals([CalendarType.Gregorian]);
    });

    // 11.4.6 has no sentence that ties ActiveCalendarType to SupportedCalendarTypes. The membership rule follows CHIP,
    // which answers a write outside the list with CONSTRAINT_ERROR. CHIP keeps its configured default calendar when it
    // is listed and otherwise uses the first supported type. matter.js does the same with the detected calendar.
    it("starts with a supported calendar when the detected calendar is not in the configured list", async () => {
        await using node = await MockServerNode.create(
            rootWith({ supportedCalendarTypes: [CalendarType.Buddhist, CalendarType.Chinese] }),
        );

        expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Buddhist);
    });

    it("detects the calendar once on a first start without a configured list", async () => {
        let detections = 0;
        class CountingServer extends DetectingServer {
            override get detectedCalendarType(): TimeFormatLocalizationServer["detectedCalendarType"] {
                detections++;
                return super.detectedCalendarType;
            }
        }

        await using _node = await MockServerNode.create(MockServerNode.RootEndpoint.with(CountingServer));

        expect(detections).equals(1);
    });

    it("builds SupportedCalendarTypes from a configured ActiveCalendarType", async () => {
        await using node = await MockServerNode.create(rootWith({ activeCalendarType: CalendarType.Buddhist }));

        expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Buddhist);
        expect(node.state.timeFormatLocalization.supportedCalendarTypes).deep.equals([CalendarType.Buddhist]);
    });

    it("replaces a configured ActiveCalendarType that is not in the configured list", async () => {
        using log = captureLog(LogLevel.WARN);

        await using node = await MockServerNode.create(
            rootWith({
                activeCalendarType: CalendarType.Hebrew,
                supportedCalendarTypes: [CalendarType.Buddhist, CalendarType.Gregorian],
            }),
        );

        expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Gregorian);
        expectOneReset(log, "Hebrew", "Gregorian");
    });

    it("logs nothing about a reset on a first start without an ActiveCalendarType", async () => {
        using log = captureLog(LogLevel.WARN);

        await using _node = await MockServerNode.create(
            rootWith({ supportedCalendarTypes: [CalendarType.Buddhist, CalendarType.Chinese] }),
        );

        expect(resetLines(log)).deep.equals([]);
    });

    it("prefers the detected calendar when it is in the configured list", async () => {
        await using node = await MockServerNode.create(
            rootWith({ supportedCalendarTypes: [CalendarType.Buddhist, CalendarType.Gregorian] }),
        );

        expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Gregorian);
    });

    // Characterization: passes on the code before this change
    it("rejects a controller write of a calendar outside the supported list with CONSTRAINT_ERROR", async () => {
        await using node = await MockServerNode.createOnline(
            rootWith({ supportedCalendarTypes: [CalendarType.Buddhist, CalendarType.Gregorian] }),
        );

        expect(onlyStatus(await writeAttribute(node, "activeCalendarType", CalendarType.Hebrew))).equals(
            Status.ConstraintError,
        );
        expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Gregorian);
    });

    // Characterization: passes on the code before this change
    it("accepts a controller write of a calendar in the supported list", async () => {
        await using node = await MockServerNode.createOnline(
            rootWith({ supportedCalendarTypes: [CalendarType.Buddhist, CalendarType.Gregorian] }),
        );

        expect(onlyStatus(await writeAttribute(node, "activeCalendarType", CalendarType.Buddhist))).equals(
            Status.Success,
        );
        expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Buddhist);
    });

    // 11.4.5.1 lists UseActiveLocale (255) as a HourFormatEnum value and 11.4.6 gives HourFormat the constraint "all".
    it("stores HourFormat UseActiveLocale as written", async () => {
        await using node = await MockServerNode.createOnline(rootWith());

        expect(onlyStatus(await writeAttribute(node, "hourFormat", HourFormat.UseActiveLocale))).equals(Status.Success);
        expect(node.state.timeFormatLocalization.hourFormat).equals(HourFormat.UseActiveLocale);
    });

    // 11.4.6 says nothing about ActiveCalendarType 255 vs SupportedCalendarTypes. CHIP also requires the value to be
    // in the supported list.
    it("rejects ActiveCalendarType UseActiveLocale while it is not a supported calendar", async () => {
        await using node = await MockServerNode.createOnline(rootWith());

        expect(onlyStatus(await writeAttribute(node, "activeCalendarType", CalendarType.UseActiveLocale))).equals(
            Status.ConstraintError,
        );
    });

    // Characterization: passes on the code before this change
    it("keeps written HourFormat and ActiveCalendarType across a restart", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));
        const root = rootWith({ supportedCalendarTypes: [CalendarType.Gregorian, CalendarType.Buddhist] });

        {
            await using node = await MockServerNode.createOnline(root, { id: "time", environment });
            expect(onlyStatus(await writeAttribute(node, "hourFormat", HourFormat["12Hr"]))).equals(Status.Success);
            expect(onlyStatus(await writeAttribute(node, "activeCalendarType", CalendarType.Buddhist))).equals(
                Status.Success,
            );
        }

        {
            await using node = await MockServerNode.createOnline(root, { id: "time", environment });
            expect(node.state.timeFormatLocalization.hourFormat).equals(HourFormat["12Hr"]);
            expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Buddhist);
        }
    });

    it("starts with a supported calendar when the stored ActiveCalendarType is no longer supported", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));

        {
            const root = rootWith({ supportedCalendarTypes: [CalendarType.Gregorian, CalendarType.Buddhist] });
            await using node = await MockServerNode.createOnline(root, { id: "time", environment });
            expect(onlyStatus(await writeAttribute(node, "activeCalendarType", CalendarType.Buddhist))).equals(
                Status.Success,
            );
        }

        {
            using log = captureLog(LogLevel.WARN);
            const root = rootWith({ supportedCalendarTypes: [CalendarType.Gregorian, CalendarType.Chinese] });
            await using node = await MockServerNode.createOnline(root, { id: "time", environment });
            expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Gregorian);
            expectOneReset(log, "Buddhist", "Gregorian");
        }
    });

    it("falls back to the first supported calendar when the stored and the detected calendar are not listed", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));

        {
            const root = rootWith({ supportedCalendarTypes: [CalendarType.Gregorian, CalendarType.Buddhist] });
            await using node = await MockServerNode.createOnline(root, { id: "time", environment });
            expect(onlyStatus(await writeAttribute(node, "activeCalendarType", CalendarType.Buddhist))).equals(
                Status.Success,
            );
        }

        {
            const root = rootWith({ supportedCalendarTypes: [CalendarType.Chinese, CalendarType.Coptic] });
            await using node = await MockServerNode.createOnline(root, { id: "time", environment });
            expect(node.state.timeFormatLocalization.activeCalendarType).equals(CalendarType.Chinese);
        }
    });

    it("lets a subclass of the class itself override the detected formats with any enum value", () => {
        // Type-level check only: a failure shows as a build error in this file
        class ActiveLocaleFormats extends TimeFormatLocalizationServer {
            override get detectedHourFormat() {
                return TimeFormatLocalization.HourFormat.UseActiveLocale;
            }

            override get detectedCalendarType() {
                return TimeFormatLocalization.CalendarType.UseActiveLocale;
            }
        }
        void ActiveLocaleFormats;
    });

    it("uses the overridden detected formats of a derived type", async () => {
        // The runtime assertions also pass on the old declarations; the compile of the overrides is the check
        class FixedFormats extends TimeFormatLocalizationServer.with("CalendarFormat") {
            override get detectedHourFormat() {
                return TimeFormatLocalization.HourFormat["12Hr"];
            }
            override get detectedCalendarType() {
                return TimeFormatLocalization.CalendarType.Buddhist;
            }
        }

        await using node = await MockServerNode.create(
            ServerNode.RootEndpoint.with(
                FixedFormats.set({ supportedCalendarTypes: [TimeFormatLocalization.CalendarType.Buddhist] }),
            ),
        );

        expect(node.state.timeFormatLocalization.hourFormat).equals(TimeFormatLocalization.HourFormat["12Hr"]);
        expect(node.state.timeFormatLocalization.activeCalendarType).equals(
            TimeFormatLocalization.CalendarType.Buddhist,
        );
    });
});

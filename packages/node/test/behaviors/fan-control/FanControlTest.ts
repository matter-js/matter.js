import { FanControlServer } from "#behaviors/fan-control";
import { AirPurifierDevice } from "#devices/air-purifier";
import { OnOffPlugInUnitDevice } from "#devices/on-off-plug-in-unit";
import { FanControl } from "@matter/types/clusters/fan-control";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("FanControlServer", () => {
    it("accepts local mode tags", async () => {
        const node = await MockServerNode.create();
        const DeviceType = OnOffPlugInUnitDevice.with(FanControlServer);
        await node.add(DeviceType, {
            fanControl: {
                fanMode: FanControl.FanMode.On, // Allows also to set the deprecated value?
                fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
                percentSetting: 50,
                percentCurrent: 50,
            },
        });
        await node.start();
        await node.close();
    });

    it("has not-off-only commands by default", async () => {
        const node = await MockServerNode.create();
        const fan = await node.add(AirPurifierDevice.with(AirPurifierDevice.requirements.OnOffServer), {
            fanControl: {
                fanMode: FanControl.FanMode.Off,
                fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
                percentSetting: 50,
                percentCurrent: 50,
            },
        });
        await fan.act(async agent => {
            await agent.onOff.on();
        });
    });
});

# Example device with MQTT control enabled

This example demonstrates how to implement a matter.js device that you can control via MQTT.

This requires an MQTT 5 broker.  The example is configured for a broker on localhost by default.

You may modify {@link MqttDevice.ts} to change the default address, or override using environment variables:

    MATTER_MQTT_ADDRESS=mqtt://localhost/matter/light01

or command line arguments:

    --mqtt-address=mqtt://localhost/matter/light01

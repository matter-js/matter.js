import React from "react";
import ReactDOM from "react-dom/client";

// Import our custom CSS
import "./scss/styles.scss";

// Import all of Bootstrap’s JS

import "bootstrap-icons/font/bootstrap-icons.css";

export default function App() {
    const [threadNetworkNameText, onChangeThreadNetworkNameText] = React.useState("ThreadNetworkName");
    const [threadOperationalDatasetText, onChangeThreadOperationalDatasetText] = React.useState("");

    const [wifiSSIDText, onChangeWifiSSIDText] = React.useState("WiFiSSID");
    const [wifiCredentialText, onChangeWifiCredentialText] = React.useState("");

    const [matterLongDiscriminatorText, onChangeMatterLongDiscriminatorText] = React.useState("3840");
    const [matterPasscodeText, onChangeMatterPasscodeText] = React.useState("20202021");
    const [matterPairingcodeText, onChangeMatterPairingcodeText] = React.useState("34970112332");
    const [matterQRCodeText, onChangeMatterQRCodeText] = React.useState("MT:6FCJ142C00KA0648G00");

    const commissionButtonClickAsync = async (): Promise<void> => {
        console.log("commissionButtonClickAsync() async");

        console.log(`threadNetworkNameText ` + threadNetworkNameText);
        console.log(`threadOperationalDatasetText ` + threadOperationalDatasetText);

        console.log(`matterLongDiscriminatorText ` + matterLongDiscriminatorText);
        console.log(`matterPasscodeText ` + matterPasscodeText);
        console.log(`matterPairingcodeText ` + matterPairingcodeText);
        console.log(`matterQRCodeText ` + matterQRCodeText);

        const _result = await window.electronAPI.handleMatter(
            threadNetworkNameText,
            threadOperationalDatasetText,
            parseInt(matterLongDiscriminatorText),
            parseInt(matterPasscodeText),
        );
    };

    return (
        <div>
            <form>
                <div className="container text-left">
                    {/* <h1>Matter</h1> */}

                    <div className="row align-items-start">
                        <div className="col">
                            <h2>Thread Network Settings</h2>
                            <div className="mb-3">
                                <label htmlFor="threadNetworkName" className="form-label">
                                    Network Name
                                </label>
                                <input
                                    type="text"
                                    id="threadNetworkName"
                                    name="threadNetworkName"
                                    placeholder="NEST-PAN-F15F"
                                    className="form-control"
                                    value={threadNetworkNameText}
                                    onChange={e => {
                                        onChangeThreadNetworkNameText(e.target.value);
                                    }}
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="threadOperationalDataset" className="form-label">
                                    Operational Dataset
                                </label>
                                <input
                                    type="password"
                                    id="threadOperationalDataset"
                                    name="threadOperationalDataset"
                                    placeholder="000300001a0102f15f020807e5b1372eb688120e080000633d8c5ca8e90510f760d45b8c76f77b51529113fb146ab2030d4e4553542d50414e2d463135460708fd2da0c1435c00000410e77a14cb64f066942a6a37c236c237380c0402a0f77835060004001fffe0"
                                    className="form-control"
                                    value={threadOperationalDatasetText}
                                    onChange={e => {
                                        onChangeThreadOperationalDatasetText(e.target.value);
                                    }}
                                />
                            </div>
                        </div>
                        <div className="col">
                            <h2>WiFi Network Settings</h2>
                            <div className="mb-3">
                                <label htmlFor="threadNetworkName" className="form-label">
                                    SSID
                                </label>
                                <input
                                    type="text"
                                    id="wifiSSID"
                                    name="wifiSSID"
                                    placeholder="TODO"
                                    className="form-control"
                                    value={wifiSSIDText}
                                    onChange={e => {
                                        onChangeWifiSSIDText(e.target.value);
                                    }}
                                />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="threadOperationalDataset" className="form-label">
                                    Credential
                                </label>
                                <input
                                    type="password"
                                    id="wifiCredential"
                                    name="wifiCredential"
                                    placeholder="TODO"
                                    className="form-control"
                                    value={wifiCredentialText}
                                    onChange={e => {
                                        onChangeWifiCredentialText(e.target.value);
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/*

        <h3>Commissioned Matter Devices</h3>
        <table className="table table-sm">
          <thead>
            <tr>
              <th scope="col"><input className="form-check-input" type="checkbox" value="" id="checkDefault" /></th>
              <th scope="col">NodeID</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><input className="form-check-input" type="checkbox" value="" id="check1" /></td>
              <td>5627533229579928250</td>
              <td>
                <button className="btn btn-primary btn-success" type="button" disabled>
                  <span role="status"><i className="icon bi-wifi"></i></span>
                </button>
              </td>
            </tr>
            <tr>
              <td><input className="form-check-input" type="checkbox" value="" id="check2" /></td>
              <td>5627533229579928251</td>
              <td>
                <button className="btn btn-primary btn-warning" type="button" disabled>
                  <span role="status"><i className="icon bi-wifi-off"></i></span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div>
          <button type='button' className="m-1 btn btn-primary"><i className="icon bi-pen"></i> Configure device</button>
          <button type='button' className="m-1 btn btn-primary"><i className="icon bi-file-arrow-down"></i> Save status to File</button>
          <button type='button' className="m-1 btn btn-primary btn-danger"><i className="icon bi-eject"></i> Uncommission device</button>
        </div>

        */}

                <h3>Uncommissioned Matter Devices</h3>
                {/*
        <div>
          <button type='button' className="m-1 btn btn-primary"><i className="icon bi-file-arrow-up"></i> Add devices from File</button>
        </div>
             */}
                <table className="table table-sm">
                    <thead>
                        <tr>
                            <th scope="col">
                                <input className="form-check-input" type="checkbox" value="" id="checkDefault" />
                            </th>
                            <th scope="col">Long Discriminator</th>
                            <th scope="col">Passcode</th>
                            <th scope="col">Pairingcode</th>
                            <th scope="col">QR Code</th>
                            <th scope="col">Status</th>
                            <th scope="col"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {/*
            <tr>
              <td><input className="form-check-input" type="checkbox" value="" id="check3" disabled/></td>
              <td>3839</td>
              <td>20202020</td>
              <td>34970112331</td>
              <td>MT:6FCJ142C00KA0648G01</td>
              <td>
                <button className="btn btn-primary" type="button" disabled>
                  <span role="status">Commissioning </span>
                  <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
                </button>
              </td>
              <td><button type="button" className="btn btn-primary" disabled><i className="icon bi-dash-circle"></i></button></td>
            </tr>
            <tr>
              <td><input className="form-check-input" type="checkbox" value="" id="check3"/></td>
              <td>3840</td>
              <td>20202021</td>
              <td>34970112332</td>
              <td>MT:6FCJ142C00KA0648G00</td>
              <td>
                <button className="btn btn-secondary" type="button" disabled>
                  <span role="status">Uncommissioned</span>
                </button>
              </td>
              <td><button type="button" className="btn btn-primary"><i className="icon bi-dash-circle"></i></button></td>
            </tr>
             */}
                        <tr>
                            <td></td>
                            <td>
                                <input
                                    type="text"
                                    id="longDiscriminator"
                                    name="longDiscriminator"
                                    placeholder="3840"
                                    className="form-control"
                                    value={matterLongDiscriminatorText}
                                    onChange={e => {
                                        onChangeMatterLongDiscriminatorText(e.target.value);
                                    }}
                                />
                            </td>
                            <td>
                                <input
                                    type="password"
                                    id="passcode"
                                    name="passcode"
                                    placeholder="20202021"
                                    className="form-control"
                                    value={matterPasscodeText}
                                    onChange={e => {
                                        onChangeMatterPasscodeText(e.target.value);
                                    }}
                                />
                            </td>
                            <td>
                                <input
                                    id="pairingcode"
                                    name="pairingcode"
                                    placeholder="34970112332"
                                    className="form-control"
                                    value={matterPairingcodeText}
                                    onChange={e => {
                                        onChangeMatterPairingcodeText(e.target.value);
                                    }}
                                />
                            </td>
                            <td>
                                <input
                                    id="qrcode"
                                    name="qrcode"
                                    placeholder="MT:6FCJ142C00KA0648G00"
                                    className="form-control"
                                    value={matterQRCodeText}
                                    onChange={e => {
                                        onChangeMatterQRCodeText(e.target.value);
                                    }}
                                />
                            </td>
                            <td></td>
                            <td>
                                <button type="button" className="btn btn-primary">
                                    <i className="icon bi-plus-circle"></i>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div>
                    <button type="button" onClick={commissionButtonClickAsync} className="m-1 btn btn-primary">
                        <i className="icon bi-patch-plus"></i> Commission selected devices
                    </button>
                </div>
            </form>
        </div>
    );
}

const container = document.getElementById("root");
if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(<App />);
}

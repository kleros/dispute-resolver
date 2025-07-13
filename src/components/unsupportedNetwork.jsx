import React from "react";
class UnsupportedNetwork extends React.Component {
  render() {
    const {network, networkMap} = this.props;
    return (
      <main>
        <h1>Unsupported Network {network}</h1>
        <p>Please switch over one of the following networks.</p>
        <ol>
          {Object.entries(networkMap).map(([key, value]) => (
            <li key={key}>
              <a role="button" onClick={() => switchToNetwork(`0x${parseInt(key, 10).toString(16)}`)}>{value.NAME} ({key})</a>
            </li>
          ))}
        </ol>
      </main>
    );
  }
}
export default UnsupportedNetwork;
async function switchToNetwork(networkID) {
  console.log(networkID)
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: networkID }],
    });
  } catch (error) {
    console.error('Error while switching network', error);
  }
}
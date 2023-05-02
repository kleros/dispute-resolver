import React from "react";
class UnsupportedNetwork extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    const {network, networkMap} = this.props;
    return (
      <section>
        <h1>Unsupported Network {network}</h1>
        <p>Please switch over one of the following networks.</p>
        <ol>
          {Array.from(networkMap).entries().map((a, b, c) => (<li>{a} {b} {c}</li>))}
        </ol>
      </section>
    );
  }
}
export default UnsupportedNetwork;

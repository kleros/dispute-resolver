import { Navbar, Nav, Dropdown } from "react-bootstrap";
import React from "react";
import { ReactComponent as Brand } from "../assets/images/logo-dispute-resolver-white.svg";
import { LinkContainer } from "react-router-bootstrap";
import {utils} from "web3";



class Header extends React.Component {
  constructor(props) {
    super(props);

    this.handleConnectClick = this.handleConnectClick.bind(this);
  }

  handleConnectClick = (e) => {
    console.log(e)
  };

  render() {
    const { viewOnly, network, networkMap } = this.props;
    
    return (
      <header>
        <Navbar collapseOnSelect expand="lg" variant="dark" >
          <Navbar.Brand href="/" >
            <Brand />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="responsive-navbar-nav" />
          <Navbar.Collapse id="responsive-navbar-nav">
            <Nav className='w-100'>
              <LinkContainer to="/ongoing/">
                <Nav.Link className=" mx-3">Ongoing Disputes</Nav.Link>
              </LinkContainer>
              {!viewOnly && (
                <LinkContainer exact to="/create/">
                  <Nav.Link className=" mx-3">Create</Nav.Link>
                </LinkContainer>
              )}
              <LinkContainer exact to="/cases/">
                <Nav.Link className=" mx-3">Interact</Nav.Link>
              </LinkContainer>
              <div className='mt-auto ml-auto'>
                <Dropdown>
                  <Dropdown.Toggle variant="success" id="dropdown-basic">
                    {networkMap[network]?.NAME}
                  </Dropdown.Toggle>

                  <Dropdown.Menu>
                    {Object.entries(networkMap).map(([networkID, networkDetails])=>
                      <Dropdown.Item key={networkID} onClick={() => ethereum
                        .request({ method: "wallet_switchEthereumChain",  params: [{"chainId": utils.numberToHex(networkID)}
                      ] })}>{networkDetails.NAME}</Dropdown.Item>    )}

                  </Dropdown.Menu>
                </Dropdown>
                <button onClick={this.handleConnectClick}>Connect</button>
              </div>
            </Nav>
          </Navbar.Collapse>
        </Navbar>
        {viewOnly && (
          <div style={{ padding: "1rem 2rem", fontSize: "14px", background: "#fafafa" }}>
            View mode only: Actions that require an Ethereum account are disabled. To use them, a web3 browser like{" "}
            <a href="https://metamask.io" target="_blank" rel="noreferrer noopener">
              Metamask
            </a>{" "}
            is required.
          </div>
        )}
      </header>
    );
  }
}

export default Header;

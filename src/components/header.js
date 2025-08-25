import { Navbar, Nav } from "react-bootstrap";
import React from "react";
import { ReactComponent as Brand } from "../assets/images/logo-dispute-resolver-white.svg";
import { LinkContainer } from "react-router-bootstrap";
import SmartContractWalletWarning from "./smartContractWalletWarning";
import PropTypes from "prop-types";

class Header extends React.Component {
  render() {
    const { viewOnly, route, activeAddress, web3Provider } = this.props;

    const chainId = route.match.params.chainId;

    return (
      <header>
        <SmartContractWalletWarning activeAddress={activeAddress} web3Provider={web3Provider} />
        <Navbar collapseOnSelect expand="lg" variant="dark" >
          <Navbar.Brand href={`/${chainId}`} >
            <Brand />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="responsive-navbar-nav" />
          <Navbar.Collapse id="responsive-navbar-nav">
            <Nav>
              <LinkContainer to={`/${chainId}/ongoing/`}>
                <Nav.Link className=" mx-3">Ongoing Disputes</Nav.Link>
              </LinkContainer>
              {!viewOnly && (
                <LinkContainer exact to={`/${chainId}/create/`}>
                  <Nav.Link className=" mx-3">Create</Nav.Link>
                </LinkContainer>
              )}
              <LinkContainer exact to={`/${chainId}/cases/`}>
                <Nav.Link className=" mx-3">Interact</Nav.Link>
              </LinkContainer>
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

Header.propTypes = {
  viewOnly: PropTypes.bool.isRequired,
  route: PropTypes.object.isRequired,
  activeAddress: PropTypes.string.isRequired,
  web3Provider: PropTypes.object.isRequired,
};

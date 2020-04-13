import { Navbar, Nav } from "react-bootstrap";
import React from "react";
import styled from "styled-components/macro";
import { ReactComponent as LogoSVG } from "../assets/images/logo-dispute-resolver-white.svg";
import { NavLink, Link } from "react-router-dom";

const StyledBanner = styled.div`
  padding: 1.1em 1.5em;
  font-size: 13px;
  background: #ffe03d;
`;

class TopBanner extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    const { viewOnly } = this.props;
    console.debug(this.props);
    return (
      <>
        <Navbar collapseOnSelect expand="lg" variant="dark" id="header">
          <Navbar.Brand href="/" style={{ padding: "0", margin: "0" }}>
            <LogoSVG />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="responsive-navbar-nav" />
          <Navbar.Collapse id="responsive-navbar-nav">
            <Nav className="abs-center-x ">
              <NavLink className="nav-link mx-3" to="/create/">
                Create
              </NavLink>
              <NavLink className="nav-link mx-3" to="/disputes/">
                Open Disputes
              </NavLink>
              <NavLink className="nav-link mx-3" to="/interact/">
                Interact
              </NavLink>
            </Nav>
            <Nav className="abs-end-x " />
          </Navbar.Collapse>
        </Navbar>
        {viewOnly && (
          <StyledBanner>
            View mode only: Actions that require an Ethereum account are disabled. To use them, a web3 browser like{" "}
            <a href="https://metamask.io" target="_blank" rel="noreferrer noopener">
              Metamask
            </a>{" "}
            is required.
          </StyledBanner>
        )}
      </>
    );
  }
}

export default TopBanner;

import { Navbar, Nav } from "react-bootstrap";
import React from "react";
import styled from "styled-components/macro";
import { ReactComponent as LogoSVG } from "../assets/images/logo-dispute-resolver-white.svg";
import { NavLink, Link } from "react-router-dom";
import { LinkContainer } from "react-router-bootstrap";

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
          <Navbar.Collapse id="responsive-navbar-nav" style={{ placeContent: "center", marginRight: "240px" }}>
            <Nav>
              <LinkContainer to="/create/">
                <Nav.Link className=" mx-3">Create</Nav.Link>
              </LinkContainer>
              <LinkContainer to="/disputes/">
                <Nav.Link className=" mx-3">Open Disputes</Nav.Link>
              </LinkContainer>
              <LinkContainer to="/interact/">
                <Nav.Link className=" mx-3">Interact</Nav.Link>
              </LinkContainer>
            </Nav>
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

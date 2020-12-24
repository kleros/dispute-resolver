import { Navbar, Nav } from "react-bootstrap";
import React from "react";
import { ReactComponent as Brand } from "../assets/images/logo-dispute-resolver-white.svg";
import { NavLink, Link } from "react-router-dom";
import { LinkContainer } from "react-router-bootstrap";

import styles from "./styles/header.module.css";

class Header extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    const { viewOnly } = this.props;
    console.debug(this.props);
    return (
      <header>
        <Navbar collapseOnSelect expand="lg" variant="dark" className={styles.navbar}>
          <Navbar.Brand href="/" className={styles.navbarBrand}>
            <Brand />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="responsive-navbar-nav" />
          <Navbar.Collapse id="responsive-navbar-nav">
            <Nav>
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
            </Nav>
          </Navbar.Collapse>
        </Navbar>
        {viewOnly && (
          <div>
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

import { Navbar, Nav } from "react-bootstrap";
import React from "react";

class TopBanner extends React.Component {
  constructor(props) {
    super(props);
    console.log(props);
  }
  render() {
    return (
      <Navbar collapseOnSelect expand="lg" variant="dark" id="header">
        <Navbar.Brand href="#home">
          <img src="logo.svg" alt="Kleros Logo" />
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="abs-center-x ">
            <Nav.Link
              className="mx-3"
              href="/create"
              active={this.props.pathname && this.props.pathname == "/create"}
            >
              Create
            </Nav.Link>
            <Nav.Link
              className="mx-3"
              href="/interact"
              active={
                this.props.pathname && this.props.pathname == "/interact/"
              }
            >
              Interact
            </Nav.Link>
          </Nav>
          <Nav className="abs-end-x " />
        </Navbar.Collapse>
      </Navbar>
    );
  }
}

export default TopBanner;

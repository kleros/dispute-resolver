import { Navbar, Nav } from "react-bootstrap";
import React from "react";

class Footer extends React.Component {
  render() {
    return (
      <Navbar
        collapseOnSelect
        expand="lg"
        variant="dark"
        id="footer"
        fixed="bottom"
      >
        <Navbar.Brand href="https://kleros.io">
          Find out more about Kleros
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="abs-center-x">
            <Nav.Link href="/">Binary Arbitrable Proxy</Nav.Link>
          </Nav>{" "}
          <Nav className="abs-end-x ">
            <Nav.Item>
              {" "}
              <Nav.Link className="mr-5" href="https://t.me/kleros">
                <div>
                  I need help <img src="help.svg" alt="help" />
                </div>
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={2} href="https://twitter.com/kleros_io">
                <img src="twitter.svg" alt="help" />
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={3} href="https://github.com/kleros">
                <img src="github.svg" alt="help" />
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={4} href="https://blog.kleros.io/">
                <img src="blog.svg" alt="help" />
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link
                eventKey={5}
                href="https://www.linkedin.com/company/kleros/"
              >
                <img src="linkedin.svg" alt="help" />
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey={6} href="https://t.me/kleros">
                <img src="telegram.svg" alt="help" />
              </Nav.Link>
            </Nav.Item>
          </Nav>
        </Navbar.Collapse>
      </Navbar>
    );
  }
}

export default Footer;

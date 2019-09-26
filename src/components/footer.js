import { Card, Col, Row, Navbar, NavDropdown, Nav } from 'react-bootstrap'
import PropTypes from 'prop-types'
import React from 'react'
import { ReactComponent as Underline } from '../assets/images/underline.svg'
import styled from 'styled-components/macro'

class Footer extends React.Component {
  render() {
    return (
      <Navbar
        collapseOnSelect
        expand="lg"
        variant="dark"
        fixed="bottom"
        id="footer"
      >
        <Navbar.Brand href="https://kleros.io">
          Find out more about Kleros
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="abs-center-x">
            <Nav.Link href="/">Binary Arbitrable Proxy</Nav.Link>
          </Nav>{' '}
          <Nav className="abs-end-x ">
            <Nav.Link href="#deets">More deets</Nav.Link>
            <Nav.Link eventKey={2} href="#memes">
              Dank memes
            </Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Navbar>
    )
  }
}

export default Footer

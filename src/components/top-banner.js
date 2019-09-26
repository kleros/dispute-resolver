import { Card, Col, Row, Navbar, NavDropdown, Nav } from 'react-bootstrap'
import PropTypes from 'prop-types'
import React from 'react'
import { ReactComponent as Underline } from '../assets/images/underline.svg'
import styled from 'styled-components/macro'

class TopBanner extends React.Component {
  render() {
    return (
      <Navbar collapseOnSelect expand="lg" variant="dark" id="header">
        <Navbar.Brand href="#home">
          <img src="logo.svg" alt="Kleros Logo" />
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="abs-center-x ">
            <Nav.Link className="mx-3" href="/create">
              Create
            </Nav.Link>
            <Nav.Link className="mx-3" href="/interact">
              Interact
            </Nav.Link>
          </Nav>
          <Nav className="abs-end-x " />
        </Navbar.Collapse>
      </Navbar>
    )
  }
}

export default TopBanner

import React, { useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import TopBanner from '../components/top-banner'
import Confirmation from '../components/confirmation'

import { useDropzone } from 'react-dropzone'
import Dropzone from 'react-dropzone'

import {
  Container,
  Row,
  Col,
  Button,
  Form,
  Spinner,
  Card,
  Modal,
  Dropdown,
  InputGroup,
  FormControl
} from 'react-bootstrap'

import {
  BrowserRouter,
  NavLink,
  Route,
  Switch,
  Redirect
} from 'react-router-dom'

class CreateDispute extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      initialNumberOfJurors: '3',
      title: '',
      description: '',
      question: '',
      firstRulingOption: '',
      firstRulingDescription: '',
      secondRulingOption: '',
      secondRulingDescription: '',
      modalShow: false,
      awaitingConfirmation: false,
      lastDisputeID: '',
      selectedSubcourt: '',
      subcourts: [],
      subcourtsLoading: true,
      arbitrationCost: ''
    }
  }

  componentDidMount = async e => {
    // TODO Simplify
    let subcourtURI,
      subcourt,
      subcourts = [],
      counter = 0,
      subcourtURIs = []
    while (counter < 15) {
      subcourtURI = await this.props.getSubCourtDetailsCallback(counter++)
      subcourtURIs.push(subcourtURI)
    }

    console.log(subcourtURIs)

    for (var i = 0; i < subcourtURIs.length; i++) {
      console.log(subcourtURIs[i])
      try {
        if (subcourtURIs[i].includes('http')) {
          subcourt = await fetch(subcourtURIs[i])
        } else {
          subcourt = await fetch('https://ipfs.kleros.io' + subcourtURIs[i])
        }
        subcourts[i] = await subcourt.json()
      } catch (e) {
        console.log(i)
      }
      console.log(subcourts)
    }
    await this.setState({ subcourts })
    await this.setState({ subcourtsLoading: false })
  }

  onSubcourtSelect = async subcourtID => {
    await this.setState({ selectedSubcourt: subcourtID })
    this.calculateArbitrationCost(
      this.state.selectedSubcourt,
      this.state.initialNumberOfJurors
    )
  }

  onModalClose = e =>
    this.setState({ modalShow: false, awaitingConfirmation: false })

  onModalShow = e => this.setState({ modalShow: true })

  onControlChange = async e => {
    await this.setState({ [e.target.id]: e.target.value })

    this.calculateArbitrationCost(
      this.state.selectedSubcourt,
      this.state.initialNumberOfJurors
    )
  }

  onDrop = acceptedFiles => {
    console.log(acceptedFiles)
    this.setState({ fileInput: acceptedFiles[0] })

    var reader = new FileReader()
    reader.readAsArrayBuffer(acceptedFiles[0])
    reader.addEventListener('loadend', async () => {
      const buffer = Buffer.from(reader.result)

      const result = await this.props.publishCallback(
        acceptedFiles[0].name,
        buffer
      )

      console.log(result)

      await this.setState({
        primaryDocument: '/ipfs/' + result[1].hash + result[0].path
      })
    })
  }

  calculateArbitrationCost = async (subcourtID, noOfJurors) =>
    subcourtID &&
    noOfJurors &&
    this.setState({
      arbitrationCost: await this.props.getArbitrationCostCallback(
        subcourtID,
        noOfJurors
      )
    })

  onCreateDisputeButtonClick = async e => {
    e.preventDefault()
    e.stopPropagation()
    console.log('create dispute clicked')
    const {
      selectedSubcourt,
      initialNumberOfJurors,
      title,
      description,
      question,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription,
      primaryDocument
    } = this.state
    console.log('state loaded')

    this.setState({ awaitingConfirmation: true })
    try {
      console.log('tryinna')
      const receipt = await this.props.createDisputeCallback({
        selectedSubcourt,
        initialNumberOfJurors,
        title,
        description,
        question,
        firstRulingOption,
        secondRulingOption,
        firstRulingDescription,
        secondRulingDescription,
        primaryDocument
      })
      console.log('ALOOO')
      this.setState({
        lastDisputeID: receipt.events.Dispute.returnValues._disputeID
      })
    } catch (e) {
      this.setState({ awaitingConfirmation: false })
    }

    this.onModalClose()
  }

  render() {
    console.log('RENDERING CREATE DISPUTE')
    console.debug(this.props)
    console.debug(this.state)

    const {
      initialNumberOfJurors,
      category,
      title,
      description,
      question,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription,
      modalShow,
      awaitingConfirmation,
      lastDisputeID,
      primaryDocument,
      selectedSubcourt,
      subcourts,
      subcourtsLoading,
      fileInput,
      arbitrationCost
    } = this.state

    return (
      <Container fluid="true">
        {lastDisputeID && <Redirect to={`/interact/${lastDisputeID}`} />}

        <TopBanner title="title" description="description" />

        <Card>
          <Card.Header>
            <img src="gavel.svg" alt="gavel" />
            Create a Dispute
          </Card.Header>
          <hr />
          <Card.Body>
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="subcourt-dropdown">Court</Form.Label>
                    <Dropdown onSelect={this.onSubcourtSelect}>
                      <Dropdown.Toggle
                        id="subcourt-dropdown"
                        block
                        disabled={subcourtsLoading}
                      >
                        {(subcourtsLoading && 'Loading...') ||
                          (selectedSubcourt &&
                            subcourts[selectedSubcourt].name) ||
                          'Please select a court'}
                      </Dropdown.Toggle>

                      <Dropdown.Menu>
                        {subcourts.map((subcourt, index) => (
                          <Dropdown.Item key={index} eventKey={index}>
                            {subcourt.name}
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Menu>
                    </Dropdown>
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="initialNumberOfJurors">
                      Initial number of jurors
                    </Form.Label>
                    <Form.Control
                      id="initialNumberOfJurors"
                      as="input"
                      type="number"
                      value={initialNumberOfJurors}
                      onChange={this.onControlChange}
                      placeholder={'Initial number of jurors'}
                    />
                  </Form.Group>
                </Col>{' '}
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="arbitrationFee">
                      Arbitration Cost
                    </Form.Label>
                    <Form.Control
                      id="arbitrationFee"
                      readOnly
                      type="text"
                      value={arbitrationCost && arbitrationCost + ' Ether'}
                      placeholder="Please select a court and specify number of jurors."
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <hr />
              <Form.Row>
                <Col>
                  <Form.Group controlId="title">
                    <Form.Label htmlFor="title">Title</Form.Label>
                    <Form.Control
                      as="input"
                      value={title}
                      onChange={this.onControlChange}
                      placeholder={'Title'}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Label htmlFor="description">Description</Form.Label>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="description">
                    <Form.Control
                      as="textarea"
                      rows="3"
                      value={description}
                      onChange={this.onControlChange}
                      placeholder={'Description of dispute in markdown'}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group controlId="markdown-description">
                    <ReactMarkdown source={description} />
                  </Form.Group>
                </Col>
              </Form.Row>

              <hr />
              <Form.Row>
                <Col>
                  <Form.Group controlId="question">
                    <Form.Label htmlFor="question">Question</Form.Label>

                    <Form.Control
                      as="input"
                      rows="1"
                      value={question}
                      onChange={this.onControlChange}
                      placeholder={'Question'}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="firstRulingOption">
                      First Ruling Option
                    </Form.Label>
                    <Form.Control
                      id="firstRulingOption"
                      as="input"
                      value={firstRulingOption}
                      onChange={this.onControlChange}
                      placeholder={'First ruling option'}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="firstRulingDescription">
                      First Ruling Description
                    </Form.Label>
                    <Form.Control
                      id="firstRulingDescription"
                      as="input"
                      value={firstRulingDescription}
                      onChange={this.onControlChange}
                      placeholder={'Description of first ruling option'}
                    />
                  </Form.Group>
                </Col>{' '}
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="secondRulingOption">
                      Second Ruling Option
                    </Form.Label>
                    <Form.Control
                      id="secondRulingOption"
                      as="input"
                      value={secondRulingOption}
                      onChange={this.onControlChange}
                      placeholder={'Second ruling option'}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="secondRulingDescription">
                      Second Ruling Description
                    </Form.Label>
                    <Form.Control
                      id="secondRulingDescription"
                      as="input"
                      value={secondRulingDescription}
                      onChange={this.onControlChange}
                      placeholder={'Description of second ruling option'}
                    />
                  </Form.Group>
                </Col>{' '}
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Label htmlFor="dropzone">Primary Document</Form.Label>
                    <Dropzone onDrop={this.onDrop}>
                      {({ getRootProps, getInputProps }) => (
                        <section id="dropzone">
                          <div {...getRootProps()} className="vertical-center">
                            <input {...getInputProps()} />
                            <h5>
                              {(fileInput && fileInput.path) ||
                                "Drag 'n' drop some files here, or click to select files."}
                            </h5>
                          </div>
                        </section>
                      )}
                    </Dropzone>
                  </Form.Group>
                </Col>
              </Form.Row>

              <Button
                disabled={
                  !selectedSubcourt ||
                  !initialNumberOfJurors ||
                  !title ||
                  !description ||
                  !question ||
                  !firstRulingOption ||
                  !firstRulingDescription ||
                  !secondRulingOption ||
                  !secondRulingDescription ||
                  !primaryDocument
                }
                variant="primary"
                type="button"
                onClick={this.onModalShow}
                block
              >
                Create Dispute{' '}
                {arbitrationCost && 'for ' + arbitrationCost + ' Ether'}
              </Button>
            </Form>
          </Card.Body>
        </Card>

        <Confirmation
          selectedSubcourt={
            selectedSubcourt && subcourts[selectedSubcourt].name
          }
          initialNumberOfJurors={initialNumberOfJurors}
          arbitrationCost={arbitrationCost}
          title={title}
          description={description}
          question={question}
          firstRulingOption={firstRulingOption}
          firstRulingDescription={firstRulingDescription}
          secondRulingOption={secondRulingOption}
          secondRulingDescription={secondRulingDescription}
          primaryDocument={primaryDocument}
          filePath={fileInput && fileInput.path}
          show={modalShow}
          onModalHide={this.onModalClose}
          onCreateDisputeButtonClick={this.onCreateDisputeButtonClick}
          awaitingConfirmation={awaitingConfirmation}
        />
      </Container>
    )
  }
}

export default CreateDispute

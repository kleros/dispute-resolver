import React from 'react'
import ReactMarkdown from 'react-markdown'
import TopBanner from '../components/top-banner'

import {
  Container,
  Row,
  Col,
  Button,
  Form,
  Spinner,
  Card,
  Modal,
  Toast,
  Dropdown,
  ButtonGroup
} from 'react-bootstrap'

class CreateDispute extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      initialNumberOfJurors: '',
      category: '',
      title: '',
      description: '',
      question: '',
      uploadedDocumentURI: '',
      firstRulingOption: '',
      firstRulingDescription: '',
      secondRulingOption: '',
      secondRulingDescription: '',
      fileInput: '',
      modalShow: false,
      awaitingConfirmation: false,
      showToast: false,
      lastDisputeID: '',
      primaryDocument: '',
      selectedSubcourt: '',
      subcourts: [],
      subcourtsLoading: true
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

  toggleshowToast = e =>
    this.setState(prevState => {
      return { showToast: !prevState.showToast }
    })

  onSubcourtSelect = async subcourtID => {
    this.setState({ selectedSubcourt: subcourtID })
  }

  onModalClose = e =>
    this.setState({ modalShow: false, awaitingConfirmation: false })

  onModalShow = e => this.setState({ modalShow: true })

  onControlChange = e => this.setState({ [e.target.id]: e.target.value })

  onInput = e => {
    this.setState({ uploadedDocumentURI: '' })
    this.setState({ fileInput: e.target.files[0] })
  }

  onSubmitButtonClick = async e => {
    e.preventDefault()
    const { fileInput } = this.state

    console.log(this.props.publishCallback)

    var reader = new FileReader()
    reader.readAsArrayBuffer(fileInput)
    reader.addEventListener('loadend', async () => {
      const buffer = Buffer.from(reader.result)
      const result = await this.props.publishCallback(fileInput.name, buffer)
      this.setState({ uploadedDocumentURI: '/ipfs/' + result[0].hash })
    })
  }

  onCreateDisputeButtonClick = async e => {
    e.preventDefault()
    e.stopPropagation()
    console.log('create dispute clicked')
    const {
      selectedSubcourt,
      initialNumberOfJurors,
      category,
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
        category,
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

      this.toggleshowToast()
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
      uploadedDocumentURI,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription,
      fileInput,
      modalShow,
      awaitingConfirmation,
      lastDisputeID,
      showToast,
      primaryDocument,
      selectedSubcourt,
      subcourts,
      subcourtsLoading
    } = this.state

    return (
      <Container fluid="true">
        <TopBanner title="title" description="description" />
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'relative',
            minHeight: '100px'
          }}
        >
          <Toast
            style={{
              position: 'absolute',
              top: 0,
              right: 0
            }}
            show={showToast}
            onClose={this.toggleshowToast}
            delay={11000}
            autohide
          >
            <Toast.Header>
              <img
                src="holder.js/20x20?text=%20"
                className="rounded mr-2"
                alt=""
              />
              <strong className="mr-auto">Tx Mined</strong>
              <small>Just now</small>
            </Toast.Header>
            <Toast.Body>
              Check out the new{' '}
              <a
                href={`https://court.kleros.io/cases/${lastDisputeID}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                dispute {lastDisputeID} on Kleros!
              </a>
            </Toast.Body>
          </Toast>
        </div>
        <Card>
          <Card.Header>
            <img src="gavel.svg" />
            Create a Dispute
          </Card.Header>
          <hr />
          <Card.Body>
            <Form>
              <Form.Row>
                <Col>
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
                </Col>
                <Col>
                  <Form.Group>
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
                  <Form.Group controlId="category">
                    <Form.Control
                      as="input"
                      type="text"
                      value={category}
                      onChange={this.onControlChange}
                      placeholder={'Category'}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="title">
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
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="markdown-description">
                    <ReactMarkdown source={description} />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="question">
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
                    <Form.Control
                      id="primaryDocument"
                      as="input"
                      value={primaryDocument}
                      onChange={this.onControlChange}
                      placeholder={'Type IPFS path of primary document'}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>

              <Button
                disabled={
                  !selectedSubcourt ||
                  !initialNumberOfJurors ||
                  !category ||
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
                Create Dispute
              </Button>
            </Form>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <img src="ipfs-logo-vector-inkscape-template.svg" alt="ipfs logo" />{' '}
            Upload to IPFS
          </Card.Header>
          <hr />
          <Card.Body>
            <Form>
              <Form.Row>
                <Col>
                  <div className="input-group mb-3">
                    <div className="custom-file">
                      <input
                        type="file"
                        className="custom-file-input"
                        id="inputGroupFile04"
                        onInput={this.onInput}
                      />
                      <label
                        className={
                          `text-left custom-file-label  ` +
                          (uploadedDocumentURI ? 'text-success' : 'text-muted')
                        }
                        htmlFor="inputGroupFile04"
                      >
                        {(fileInput && fileInput.name) || 'Select a document'}
                      </label>
                    </div>
                    <div className="input-group-append">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={this.onSubmitButtonClick}
                      >
                        Upload
                      </button>
                    </div>
                  </div>
                </Col>
              </Form.Row>
            </Form>
            {uploadedDocumentURI && uploadedDocumentURI}
          </Card.Body>
        </Card>

        <Modal show={modalShow} onHide={this.onModalClose} animation={false}>
          <Modal.Header closeButton>
            <Modal.Title>Confirmation</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Control
                      readOnly
                      type="text"
                      placeholder={selectedSubcourt}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Control
                      readOnly
                      type="text"
                      placeholder={initialNumberOfJurors}
                    />
                  </Form.Group>
                </Col>{' '}
                <Col>
                  <Form.Group controlId="category">
                    <Form.Control readOnly type="text" placeholder={category} />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="title">
                    <Form.Control readOnly type="text" placeholder={title} />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="description">
                    <Form.Control
                      readOnly
                      type="text"
                      placeholder={description}
                    />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="question">
                    <Form.Control readOnly type="text" placeholder={question} />
                  </Form.Group>
                </Col>
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Control
                      readOnly
                      type="text"
                      placeholder={firstRulingOption}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Control
                      readOnly
                      type="text"
                      placeholder={firstRulingDescription}
                    />
                  </Form.Group>
                </Col>{' '}
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Control
                      readOnly
                      type="text"
                      placeholder={secondRulingOption}
                    />
                  </Form.Group>
                </Col>
                <Col>
                  <Form.Group>
                    <Form.Control
                      readOnly
                      type="text"
                      placeholder={secondRulingDescription}
                    />
                  </Form.Group>
                </Col>{' '}
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <a
                      target="blank"
                      href={
                        primaryDocument &&
                        'https://ipfs.kleros.io' + primaryDocument
                      }
                    >
                      {primaryDocument}
                    </a>
                  </Form.Group>
                </Col>{' '}
              </Form.Row>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={this.onModalClose}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={this.onCreateDisputeButtonClick}
              disabled={awaitingConfirmation}
            >
              {awaitingConfirmation && (
                <Spinner
                  as="span"
                  animation="grow"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                />
              )}{' '}
              Broadcast Transaction
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    )
  }
}

export default CreateDispute

import React from 'react'
import Container from 'react-bootstrap/Container'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Col from 'react-bootstrap/Col'
import Row from 'react-bootstrap/Row'
import Spinner from 'react-bootstrap/Spinner'
import Card from 'react-bootstrap/Card'
import Modal from 'react-bootstrap/Modal'
import ReactMarkdown from 'react-markdown'
import Toast from 'react-bootstrap/Toast'

class CreateDispute extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      subcourtID: '',
      initialNumberOfJurors: '',
      category: '',
      title: '',
      description: '',
      question: '',
      primaryFileURI: '',
      firstRulingOption: '',
      firstRulingDescription: '',
      secondRulingOption: '',
      secondRulingDescription: '',
      fileInput: '',
      modalShow: false,
      awaitingConfirmation: false,
      showToast: false,
      lastDisputeID: ''
    }
  }

  toggleshowToast = e =>
    this.setState(prevState => {
      return { showToast: !prevState.showToast }
    })

  onModalClose = e =>
    this.setState({ modalShow: false, awaitingConfirmation: false })
  onModalShow = e => this.setState({ modalShow: true })

  onControlChange = e => this.setState({ [e.target.id]: e.target.value })

  onInput = e => {
    this.setState({ primaryFileURI: '' })
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
      this.setState({ primaryFileURI: '/ipfs/' + result[0].hash })
    })
  }

  onCreateDisputeButtonClick = async e => {
    e.preventDefault()
    console.log('create dispute clicked')
    const {
      subcourtID,
      initialNumberOfJurors,
      category,
      title,
      description,
      question,
      primaryFileURI,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription
    } = this.state

    this.setState({ awaitingConfirmation: true })
    try {
      const receipt = await this.props.createDisputeCallback({
        subcourtID,
        initialNumberOfJurors,
        category,
        title,
        description,
        question,
        firstRulingOption,
        secondRulingOption,
        firstRulingDescription,
        secondRulingDescription,
        primaryFileURI
      })

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
    console.debug(this.props)
    console.debug(this.state)

    const {
      subcourtID,
      initialNumberOfJurors,
      category,
      title,
      description,
      question,
      primaryFileURI,
      firstRulingOption,
      secondRulingOption,
      firstRulingDescription,
      secondRulingDescription,
      fileInput,
      modalShow,
      awaitingConfirmation,
      lastDisputeID,
      showToast
    } = this.state

    return (
      <Container>
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
            delay={7000}
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
          <Card.Body>
            <Card.Title>Create a Dispute</Card.Title>
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Control
                      id="subcourtID"
                      as="input"
                      type="number"
                      value={subcourtID}
                      onChange={this.onControlChange}
                      placeholder={'Subcourt identifier'}
                    />
                  </Form.Group>
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
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="category">
                    <Form.Control
                      as="input"
                      value={category}
                      onChange={this.onControlChange}
                      placeholder={'Category'}
                    />
                  </Form.Group>
                </Col>
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
                          (primaryFileURI ? 'text-success' : 'text-muted')
                        }
                        htmlFor="inputGroupFile04"
                      >
                        {(fileInput && fileInput.name) || 'Primary document'}
                      </label>
                    </div>
                    <div className="input-group-append">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={this.onSubmitButtonClick}
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                </Col>
              </Form.Row>

              <Button
                disabled={
                  !subcourtID ||
                  !initialNumberOfJurors ||
                  !category ||
                  !title ||
                  !description ||
                  !question ||
                  !firstRulingOption ||
                  !firstRulingDescription ||
                  !secondRulingOption ||
                  !secondRulingDescription ||
                  !primaryFileURI
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
                      placeholder={subcourtID}
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
              </Form.Row>
              <Form.Row>
                <Col>
                  <Form.Group controlId="category">
                    <Form.Control readOnly type="text" placeholder={category} />
                  </Form.Group>
                </Col>
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
                        primaryFileURI &&
                        'https://ipfs.kleros.io' + primaryFileURI
                      }
                    >
                      {fileInput && fileInput.name}
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

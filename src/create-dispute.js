import React from 'react'
import Container from 'react-bootstrap/Container'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Col from 'react-bootstrap/Col'
import Card from 'react-bootstrap/Card'

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
      fileInput: ''
    }
  }

  onControlChange = e => this.setState({ [e.target.id]: e.target.value })

  onInput = e => {
    this.setState({ primaryFileURI: '' })
    this.setState({ fileInput: e.target.files[0] })
  }

  onSubmitButtonClick = async e => {
    e.preventDefault()
    const { fileInput } = this.state

    var reader = new FileReader()
    reader.readAsArrayBuffer(fileInput)
    reader.addEventListener('loadend', async () => {
      const buffer = Buffer.from(reader.result)
      const result = await this.props.publishPrimaryDocumentCallback(
        fileInput.name,
        buffer
      )
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

    await this.props.createDisputeCallback({
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
      fileInput
    } = this.state

    return (
      <Container>
        <Card>
          <Card.Body>
            <Card.Title>Create Dispute</Card.Title>
            <Form>
              <Form.Row>
                <Col>
                  <Form.Group>
                    <Form.Control
                      id="subcourtID"
                      as="input"
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
                    {primaryFileURI && (
                      <div className="input-group-prepend">
                        <label
                          className={
                            'pr-2 pt-2 mb-0' +
                            (primaryFileURI ? ' text-success' : '')
                          }
                        >
                          <a
                            className={primaryFileURI ? ' text-success' : ''}
                            href={
                              primaryFileURI &&
                              'https://ipfs.kleros.io' + primaryFileURI
                            }
                          >
                            {fileInput && fileInput.name}
                          </a>
                        </label>
                      </div>
                    )}
                    <div className="custom-file">
                      <input
                        type="file"
                        className="custom-file-input"
                        id="inputGroupFile04"
                        onInput={this.onInput}
                      />
                      <label
                        className="text-left custom-file-label"
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
                variant="primary"
                type="button"
                onClick={this.onCreateDisputeButtonClick}
                block
              >
                Create Dispute
              </Button>
            </Form>
          </Card.Body>
        </Card>
      </Container>
    )
  }
}

export default CreateDispute

import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'
import App from './app'

ReactDOM.render(<App />, document.getElementById('root'))
console.log(
  `%c${process.env.COMMIT_REF}`,
  `color: #${(process.env.COMMIT_REF || '000000').substr(0, 6)}`
)

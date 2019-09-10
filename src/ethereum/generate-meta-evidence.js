export default ({
  category,
  title,
  description,
  question,
  firstRulingOption,
  secondRulingOption,
  firstRulingDescription,
  secondRulingDescription,
  fileURI
}) => ({
  category,
  title,
  description,
  question,
  rulingOptions: {
    type: 'single-select',
    titles: [firstRulingOption, secondRulingOption],
    descriptions: [firstRulingDescription, secondRulingDescription]
  },
  fileURI
})

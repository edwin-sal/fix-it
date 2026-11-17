import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'fix-it',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

const PANE = {
  plugin: 'fix-it',
  component: 'Pane',
  requestId: 'fix-grammar',
  props: {
    title: 'Fix grammar',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('button fixes the draft, check mark replaces it', async ($, on) => {
  const draft = 'i has a error in this sentense'
  const fixed = 'I have an error in this sentence.'
  let box = draft
  let filled: string | undefined
  let closed = false

  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.edit', (_, e) => ({ text: e.inputText, cursor: e.inputText.length }))
  on('prompt.change', () => ({}))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('model.complete', (_, e) => {
    expect(e.prompt).toBe(draft)
    return { value: { isAnswered: true, text: fixed, usage: {} } }
  })
  on('prompt.fill', (_, e) => {
    filled = e.text
    box = e.text
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })

  // Typing raises prompt.edit; the mod then shows the button
  await $.prompt.edit({
    origin: { kind: 'composer' },
    text: '',
    cursor: 0,
    start: 0,
    end: 0,
    inputText: draft,
  })

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const button = await band.find({ type: 'Button', key: 'fix-draft' })
  expect(button).toBeDefined()
  await band.press({ key: 'fix-draft' })
  await band.unmount()

  // Let the model call settle, then draw the result pane
  await new Promise(done => setTimeout(done, 50))
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Text', text: /I have an error/ }))?.text).toBe(fixed)
  await pane.press({ key: 'accept' })
  expect(filled).toBe(fixed)
  await pane.unmount()
})

test('no button on an empty draft; X leaves the draft alone', async ($, on) => {
  let box = ''
  let filled = false
  let fails = false
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.edit', (_, e) => ({ text: e.inputText, cursor: e.inputText.length }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('model.complete', () =>
    fails
      ? { value: { isAnswered: false, reason: 'api-error', usage: {} } }
      : { value: { isAnswered: true, text: 'Hello.', usage: {} } },
  )
  on('prompt.fill', (_, e) => {
    filled = true
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  // The engine draws nothing of its own in the band
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))

  // Empty box: the mod yields to the engine, so no button
  const empty = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await empty.find({ type: 'Button', key: 'fix-draft' })).toBeUndefined()
  await empty.unmount()

  // A failed model call shows an error and no check mark
  fails = true
  box = 'some text'
  await $.prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: box })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'fix-draft' })
  await band.unmount()
  await new Promise(done => setTimeout(done, 50))
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /Failed: api-error/ })).toBeDefined()
  expect(await pane.find({ type: 'Button', key: 'accept' })).toBeUndefined()
  await pane.press({ key: 'reject' })
  expect(filled).toBe(false)
  await pane.unmount()
})

test('Send clears the draft and submits the corrected text as the user', async ($, on) => {
  const draft = 'i has a error'
  const fixed = 'I have an error.'
  let box = draft
  const sent: { text: string; asUser?: boolean }[] = []
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.edit', (_, e) => ({ text: e.inputText, cursor: e.inputText.length }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true, text: fixed, usage: {} } }))
  on('prompt.fill', (_, e) => {
    box = e.text
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('prompt.submit', (_, e) => {
    sent.push({ text: e.text, asUser: (e.origin as { asUser?: true }).asUser })
    return { text: e.text }
  })

  await $.prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: draft })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'fix-draft' })
  await band.unmount()
  await new Promise(done => setTimeout(done, 50))
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'send' })
  expect(box).toBe('')
  expect(sent).toEqual([{ text: fixed, asUser: true }])
  await pane.unmount()
})

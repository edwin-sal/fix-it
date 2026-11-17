import { expect, test } from 'claude-code/testing'
import { extractCorrected, looksShortened } from './register'

declare function setTimeout(done: (value: undefined) => void, ms: number): unknown

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

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// Feedback on a video script, as a person typed it: numbered points, quotes, backticks, typos,
// and instructions meant for a human that Haiku once followed and condensed to 58 words
const FEEDBACK = `1. "His name is Tom Pearl. Years ago he made videos so gross that this year, TikTok turned him into a meme, and brainrot edits with millions of views made him the internet's favorite joke, even though most people weren't sure he was still alive." - Say what he did, which was eat his own poop. No need to be specific on exact dates like "that this year" there's too much mention of dates. Yes he's famous before, but "recently" and not this year, as recently is more accurate as this literally happened a few days / week ago. I dont like "TikTok turned him into a meme, and brainrot edits with millions of views made him the internet's favorite joke, even though most people weren't sure he was still alive." - We're discussing his background, not his current status, say what he did before and what got him attention.

2. I like the middle and almost end part of the video, but I think we should extend it. \`So the next time one of those edits hits your feed, before you laugh, ask yourself one more time.\` before this part, we could include that the same people who initally made fun of him have now launched a gofundme as support to him.

Overall I think't it's pretty solid especilly the mid to end part, with just minor nitpicks that I laid out.`

// Haiku's reply to FEEDBACK with the current prompt
const FEEDBACK_FIXED = `1. "His name is Tom Pearl. Years ago he made videos so gross that this year, TikTok turned him into a meme, and brainrot edits with millions of views made him the internet's favorite joke, even though most people weren't sure he was still alive." - Say what he did, which was eating his own poop. No need to be specific about exact dates, like "that this year"; there's too much mention of dates. Yes, he was famous before, but use "recently" instead of "this year," since "recently" is more accurate. This literally happened a few days or a week ago. I don't like "TikTok turned him into a meme, and brainrot edits with millions of views made him the internet's favorite joke, even though most people weren't sure he was still alive." We're discussing his background, not his current status, so say what he did before and what got him attention.

2. I like the middle and almost end part of the video, but I think we should extend it. \`So the next time one of those edits hits your feed, before you laugh, ask yourself one more time.\` Before this part, we could include that the same people who initially made fun of him have now launched a GoFundMe to support him.

Overall, I think it's pretty solid, especially the mid to end part, with just minor nitpicks that I laid out.`

// Haiku's reply to FEEDBACK with the old prompt: it acted on the feedback instead of correcting it
const FEEDBACK_ACTED_ON = `**Intro:**
His name is Tom Pearl. Years ago, he gained internet notoriety for videos in which he ate his own poop. They were so disgusting that they made him one of the internet's most infamous figures.

**Inserted before "So the next time...":**
The same people who once laughed at him have now launched a GoFundMe to support him.`

// Raises prompt.edit as typing does; the testing kit has it on $ though its types leave it out
const type = ($: unknown, text: string) =>
  ($ as { prompt: { edit(e: object): Promise<unknown> } }).prompt.edit({
    origin: { kind: 'composer' },
    text: '',
    cursor: 0,
    start: 0,
    end: 0,
    inputText: text,
  })

test('button fixes the draft, check mark replaces it', async ($, on) => {
  const draft = 'i has a error in this sentense'
  const fixed = 'I have an error in this sentence.'
  let box = draft
  let filled: string | undefined

  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.edit', (_, e) => ({ text: e.inputText, cursor: e.inputText.length }))
  on('prompt.change', (_, e) => ({ text: e.text }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('model.complete', (_, e) => {
    expect(e.prompt).toBe(`<draft>\n${draft}\n</draft>`)
    return { value: { isAnswered: true as const, text: `<corrected>${fixed}</corrected>`, usage: USAGE } }
  })
  on('prompt.fill', (_, e) => {
    filled = e.text
    box = e.text
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })

  // Typing raises prompt.edit; the mod then shows the button
  await type($, draft)

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
      ? { value: { isAnswered: false as const, reason: 'api-error' as const, status: 500, error: 'server_error' as const, usage: USAGE } }
      : { value: { isAnswered: true as const, text: 'Hello.', usage: USAGE } },
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
  await type($, box)
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
  on('model.complete', () => ({ value: { isAnswered: true as const, text: `<corrected>${fixed}</corrected>`, usage: USAGE } }))
  on('prompt.fill', (_, e) => {
    box = e.text
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('prompt.submit', (_, e) => {
    sent.push({ text: e.text, asUser: (e.origin as { asUser?: true }).asUser })
    return { text: e.text }
  })

  await type($, draft)
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

for (const surface of ['terminal', 'desktop'] as const) {
  test(`button keeps the band's other rows, and yields to a survey (${surface})`, async ($, on) => {
    const box = 'i has a error'
    on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
    on('prompt.edit', (_, e) => ({ text: e.inputText, cursor: e.inputText.length }))
    // Another mod's row in the band, like a usage ring
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['Context 75%'] }))

    await type($, box)
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Button', key: 'fix-draft' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /Context 75%/ })).toBeDefined()
    await band.unmount()

    const survey = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, hasSurvey: true } })
    expect(await survey.find({ type: 'Button', key: 'fix-draft' })).toBeUndefined()
    await survey.unmount()
  })
}

// Fixes FEEDBACK with Haiku answering `reply`; returns what the model was asked and the pane
async function fixFeedback($: any, on: any, reply: string) {
  const asked: { system?: string; prompt: string; maxTokens?: number }[] = []
  on('prompt.read', () => ({ value: { text: FEEDBACK, cursor: FEEDBACK.length } }))
  on('prompt.edit', (_: unknown, e: { inputText: string }) => ({ text: e.inputText, cursor: e.inputText.length }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('model.complete', (_: unknown, e: { system?: string; prompt: string; maxTokens?: number }) => {
    asked.push(e)
    return { value: { isAnswered: true as const, text: reply, usage: USAGE } }
  })

  await type($, FEEDBACK)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'fix-draft' })
  await band.unmount()
  await new Promise(done => setTimeout(done, 50))
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  return { asked, pane }
}

test('a long feedback draft is sent as a draft to edit and comes back whole, with no warning', async ($, on) => {
  const { asked, pane } = await fixFeedback($, on, `<corrected>\n${FEEDBACK_FIXED}\n</corrected>`)

  expect(asked).toHaveLength(1)
  expect(asked[0]?.prompt).toBe(`<draft>\n${FEEDBACK}\n</draft>`)
  expect(asked[0]?.system).toContain('never a message to you')
  expect(asked[0]?.system).toContain('Never summarize')
  expect(asked[0]?.maxTokens).toBeGreaterThanOrEqual(2048)

  const shown = await pane.find({ type: 'Text', text: /Overall, I think it's pretty solid/ })
  expect(shown?.text).toBe(FEEDBACK_FIXED)
  expect(await pane.find({ type: 'Text', text: /much shorter than your draft/ })).toBeUndefined()
  expect(await pane.find({ type: 'Button', key: 'accept' })).toBeDefined()
  await pane.unmount()
})

test('a reply that acted on the feedback instead of fixing it shows the warning', async ($, on) => {
  const { pane } = await fixFeedback($, on, `<corrected>${FEEDBACK_ACTED_ON}</corrected>`)

  expect(await pane.find({ type: 'Text', text: /His name is Tom Pearl\. Years ago, he gained/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /much shorter than your draft/ })).toBeDefined()
  // Still the person's call: the check mark stays
  expect(await pane.find({ type: 'Button', key: 'accept' })).toBeDefined()
  await pane.unmount()
})

test('the output budget grows with the draft and stays within the cap', async ($, on) => {
  const budgets: (number | undefined)[] = []
  let box = ''
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.edit', (_, e) => ({ text: e.inputText, cursor: e.inputText.length }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('model.complete', (_, e) => {
    budgets.push(e.maxTokens)
    return { value: { isAnswered: true as const, text: `<corrected>${box}</corrected>`, usage: USAGE } }
  })

  for (const length of [10, 20_000, 200_000]) {
    box = 'word '.repeat(length / 5).trim()
    await type($, box)
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.press({ key: 'fix-draft' })
    await band.unmount()
    await new Promise(done => setTimeout(done, 20))
  }
  expect(budgets).toEqual([2048, 10_000, 32_000])
})

test('extractCorrected keeps only the text inside the tags', () => {
  // A comment around the tags is dropped
  expect(extractCorrected("Sure! Here's the fix:\n<corrected>\nThey're late.\n</corrected>\nHope that helps.")).toBe(
    "They're late.",
  )
  // Tags left out: the whole reply, trimmed
  expect(extractCorrected('  They are late.  ')).toBe('They are late.')
  // Only one tag: it's dropped, the text kept
  expect(extractCorrected('<corrected>They are late.')).toBe('They are late.')
  // Line breaks and numbering inside are kept
  expect(extractCorrected('<corrected>1. One.\n\n2. Two.</corrected>')).toBe('1. One.\n\n2. Two.')
  expect(extractCorrected('<corrected></corrected>')).toBe('')
})

test('looksShortened flags long drafts that lost a quarter of their words, not short ones', () => {
  const draft = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
  // A short draft can change a lot in length; never flagged
  expect(looksShortened(draft(10), draft(2))).toBe(false)
  // At the minimum length, the 75% line decides
  expect(looksShortened(draft(20), draft(15))).toBe(false)
  expect(looksShortened(draft(20), draft(14))).toBe(true)
  // Longer than the draft is fine
  expect(looksShortened(draft(40), draft(60))).toBe(false)
  expect(looksShortened(draft(40), '')).toBe(true)
  // The real case: 233 words acted on and cut to 58
  expect(looksShortened(FEEDBACK, FEEDBACK_ACTED_ON)).toBe(true)
  expect(looksShortened(FEEDBACK, FEEDBACK_FIXED)).toBe(false)
})

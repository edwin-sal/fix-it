# fix-it

A Claude Code mod that corrects the grammar of what you've typed but not yet sent.

Type something in the input box and a "Fix grammar" button appears above the prompt.
Click it: Haiku corrects the text and a pane shows the original and the corrected
version with two buttons. The check mark replaces your draft with the corrected text;
the X closes the pane and leaves your draft alone. You can also run `/fix <text>`.

Each fix is one Haiku call and counts against your Claude plan usage.

## Install

    /plugin marketplace add edwin-sal/fix-it
    /plugin install fix-it@fix-it

Then open a new session or run `/reload-plugins`. Needs Claude Code 2.1.287 or newer.
Works in the terminal and the desktop app's Code tab (tested on the desktop app).

## License

MIT. See [LICENSE](LICENSE).

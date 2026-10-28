// The README the home page scores for its sample result: a small CLI's first draft, worked out by the checks
// themselves on every request, so the sample can never disagree with them.
export const SAMPLE_README = `# tidy: sort and dedupe the lines of any file

[![npm](https://img.shields.io/npm/v/tidy-lines.svg)](https://www.npmjs.com/package/tidy-lines)

tidy sorts the lines of a file, drops the duplicates and writes it back, so a list of names or a .gitignore stays clean.

\`\`\`bash
npm install -g tidy-lines
tidy .gitignore
\`\`\`

## Usage

Run \`tidy <file>\` to sort it in place, or \`tidy --check <file>\` in CI to fail when a file is not tidy yet.

## Options

| Flag | Default | What it does |
| --- | --- | --- |
| \`--check\` | off | Exit 1 instead of writing |
| \`--keep-case\` | off | Sort A and a apart |

## Contributing

Run \`npm test\` and open a pull request. See the [changelog](#changes).

## License

MIT
`;

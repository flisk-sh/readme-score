# rowcount: count the rows in any CSV file

![rowcount counting a file in a terminal](docs/demo.gif)

[![npm](https://img.shields.io/npm/v/rowcount.svg)](https://www.npmjs.com/package/rowcount) [![CI](https://github.com/acme/rowcount/actions/workflows/ci.yml/badge.svg)](https://github.com/acme/rowcount/actions)

rowcount counts the rows in a CSV file. It skips the header. It reads files of any size.

```bash
npm install -g rowcount
rowcount sales.csv
```

## Overview

You have a CSV file and want to know how many rows it has. A sheet may freeze on a big one. Run rowcount and you get the number at once.

## Key features

- Counts rows in files of any size.
- Skips the header row.
- Reads from a pipe too.

## Prerequisites

You need Node.js 22 or newer. Check with `node --version`.

## Installation

Install it with npm, as above. Then read [Usage](#usage).

## Usage

Give it a file. It prints the count.

## Configuration

Set `ROWCOUNT_HEADER=0` when the file has no header.

## Examples

Count the rows in two files with `rowcount a.csv b.csv`. More are in [the examples folder](examples/).

## Troubleshooting

If it prints 0, the file may be empty. Look at it with `head`.

## Roadmap

Next we add JSON lines. See [the plan](docs/roadmap.md).

## Contributing

Run `npm test` and open a pull request. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

MIT. See [LICENSE](LICENSE).

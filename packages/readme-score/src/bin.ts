#!/usr/bin/env node
import { main } from "./cli";

process.exitCode = await main(process.argv.slice(2), {
	out: (text) => process.stdout.write(`${text}\n`),
	err: (text) => process.stderr.write(`${text}\n`),
});

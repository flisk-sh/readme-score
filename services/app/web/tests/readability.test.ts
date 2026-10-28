import { describe, expect, it } from "bun:test";
import {
	jargon,
	jargonLines,
	LONG_SENTENCE_WORDS,
	longSentences,
	prose,
	READING_EASE_FULL_MARKS,
	readingEase,
	syllables,
	words,
} from "../src/readme/readability";
import { score } from "../src/readme/score";
import { fixture } from "./helpers";

const flesch = (readme: string) =>
	score({ readme, readmePath: "README.md", type: "cli" }).groups.find(
		(g) => g.id === "readability",
	)?.checks[0];

describe("readability", () => {
	it("reads prose without code, HTML, tables, images and link targets", () => {
		const md = [
			"# Title",
			'<p align="center"><img src="x.svg"></p>',
			"Run `flisk up` to start. See [the docs](https://flisk.sh/docs).",
			"```bash\nnpm install -g @flisk-sh/flisk\n```",
			"| a | b |",
			"| - | - |",
			"- a list item",
		].join("\n");
		expect(prose(md)).toBe("Title. Run to start. See the docs. a list item.");
	});

	it("counts syllables by vowel groups and drops a silent e", () => {
		expect(
			["app", "laptop", "code", "agent", "the", "readable"].map(syllables),
		).toEqual([1, 2, 1, 2, 1, 3]);
	});

	it("scores short plain sentences above long technical ones, and no prose as null", () => {
		const plain = readingEase(
			"Your agent builds the app. Flisk runs it. You see it in your browser.",
		) as number;
		const dense = readingEase(
			"Declarative orchestration of heterogeneous containerized microservices necessitates comprehensive configuration management infrastructure.",
		) as number;
		expect(plain).toBeGreaterThan(80);
		expect(dense).toBeLessThan(10);
		expect(readingEase("```\ncode only\n```")).toBeNull();
	});

	it("counts infrastructure words in prose only, with their share", () => {
		const md =
			"Docker and Tilt run your containers. Docker again.\n```\ndocker compose up\n```";
		const j = jargon(md);
		expect(j.counts).toEqual([
			["docker", 2],
			["containers", 1],
			["tilt", 1],
		]);
		expect(j.share).toBe(50);
		expect(jargonLines("Plain words.\n\nThen docker.\n\nAnd docker.")).toEqual(
			new Map([["docker", 3]]),
		);
	});

	it("lists the longest sentences over the limit with their line, longest first", () => {
		const long = (n: number) =>
			`${Array.from({ length: n }, () => "word").join(" ")}.`;
		const md = [
			"# T",
			"",
			"Short one.",
			long(LONG_SENTENCE_WORDS + 2),
			"",
			`Fine. ${long(LONG_SENTENCE_WORDS + 9)}`,
			long(LONG_SENTENCE_WORDS),
		].join("\n");
		expect(longSentences(md).map((s) => [s.line, s.words])).toEqual([
			[6, LONG_SENTENCE_WORDS + 9],
			[4, LONG_SENTENCE_WORDS + 2],
		]);
		expect(
			words(prose("Your agent builds the app. Docker is optional.")).length,
		).toBe(8);
	});

	it("gives full points at the threshold, partial points below it and none for no prose", () => {
		const good = flesch(fixture("cli-complete.md"));
		expect(good?.pass).toBe(true);
		expect(good?.points).toBe(10);
		const dense = flesch(
			"Declarative orchestration of heterogeneous containerized microservices necessitates configuration. Comprehensive infrastructure management facilitates interoperability considerations.",
		);
		expect(dense?.pass).toBe(false);
		expect(dense?.points).toBe(0);
		expect(dense?.fix).toContain("Shorter sentences");
		const none = flesch("```\nonly code\n```\n");
		expect([none?.pass, none?.measured]).toEqual([null, "no prose"]);
		const mid = flesch(
			"The configuration utility generates documentation automatically. It validates repositories.",
		);
		const ease = readingEase(
			"The configuration utility generates documentation automatically. It validates repositories.",
		) as number;
		expect(ease).toBeLessThan(READING_EASE_FULL_MARKS);
		expect(mid?.points).toBeGreaterThanOrEqual(0);
		expect(mid?.points).toBeLessThan(10);
	});
});

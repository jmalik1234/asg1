#!/usr/bin/env node

const fs = require("fs");
const {execSync} = require("child_process");
const ppp = require("papaparse");

const gradebook = ppp.parse(fs.readFileSync("names.csv", "utf8")).data.slice(2);
const cruzids = Object.fromEntries(gradebook.filter(a => a instanceof Array && 3 < a.length).map(a => [a[3].replace(/@.+/, ""), a[0].split(", ").reverse().join(" ")]));

let files = fs.readdirSync("submissions");

let valid = true;

const GRADE_A = true;
const GRADE_B = true;
const GRADE_C = true;

let submissions = {
	a: [],
	b: [],
	c: []
};

const extra = ["covid_Vaccines.csv", "sample.txt", "small_input.log", "stopwords"];

const late = new Set();

const excused = new Set("yejang", "acradfor");

for (let filename of files) {
	let matches = filename.match(/^([a-z]+)_(LATE_)?\d+_\d+_(.+)$/);
	if (!matches) {
		if (extra.indexOf(filename) == -1) {
			console.error("FAILURE:", filename);
			valid = false;
		}
		continue;
	}

	let [, username,, script] = matches;
	script = script.replace(/-\d+\.sh$/, ".sh");
	if (script == "fully_vaccinated.sh")
		script = "get_top_" + script;

	if (filename.match(/LATE_/))
		late.add(username);

	switch (script) {
		case "get_top_words.sh":            submissions.a.push([username, filename]); break;
		case "log_analyzer.sh":             submissions.b.push([username, filename]); break;
		case "get_top_fully_vaccinated.sh": submissions.c.push([username, filename]); break;
		default:
			console.log("Unexpected file:", filename);
			valid = false;
	}
}

if (!valid) {
	console.error("Stopping here.");
	return;
}

const allSubmissions = [...submissions.a, ...submissions.b, ...submissions.c];
let scores = Object.fromEntries(allSubmissions.map(([username]) => [username, {a: null, b: null, c: null}]));
let comments = Object.fromEntries(allSubmissions.map(([username]) => [username, new Set()]));

let totalScores = {a: 0, b: 0, c: 0};
let scoreSums = {a: 0, b: 0, c: 0};

console.info("Filenames validated.");

Array.prototype.unique = function() {
	return this.filter((x, i) => this.indexOf(x) == i);
};

function partA(text, stopwords, k) {
	if (typeof stopwords == "string")
		stopwords = stopwords.trim().split(/[\r\n]+/);

	let words = text.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(word => stopwords.indexOf(word) == -1).sort();

	let freqs = {};
	for (const word of words) {
		if (freqs[word] === undefined)
			freqs[word] = 1;
		else
			++freqs[word];
	}

	let orderedFreqs = words.unique().map(word => [word, freqs[word]]);
	let freqValues = Object.values(freqs);
	let freqPairs = Object.values(freqs).unique().sort((a, b) => a < b? 1 : a > b? -1 : 0).map(x => {
		return [x, freqValues.filter(v => v == x).length];
	});

	let out = [];
	freqPairs.forEach(([freq, freqCount]) => {
		orderedFreqs.filter(([, wordFreq]) => freq == wordFreq).forEach(([word]) => out.push(word));
	});

	return out.slice(0, k);
}

const aTests = [
	["Has anyone really been far even as decided to use even go want to do look more like? has like like go go go", "has\ndecided", [1,2,3,4]],
	["The weather is sunny in SC. The weather is cloudy. the weather", fs.readFileSync("stopwords", "ascii"), [1,2,3,4]]
];

if (GRADE_A) {
	for (const [username, filename] of submissions.a) {
		let success = true;

		let trials = 0;
		let passes = 0;

		a_loop:
		for (const [text, stopwords, kvals] of aTests) {
			for (const k of kvals) {
				fs.writeFileSync("sample.txt", text);
				fs.writeFileSync("stopwords", stopwords);
				++trials;
				try {
					const output = execSync(`bash submissions/${filename} sample.txt ${k}`, {encoding: "utf8"}).trim().split("\n").join(" ");
					const expected = partA(text, stopwords, k).join(" ");
					if (output != expected) {
						console.log(username, "failed part A:", {expected, output});
						success = false;
					} else {
						++passes;
					}
				} catch(e) {
					console.error(`Error executing ${username}'s part A`);
					success = false;
					if (e.stderr.indexOf("$'\\r': command not found") != -1) {
						comments[username].add("Used CRLF endings in get_top_words.sh");
					}
				}
			}
		}

		++totalScores.a;
		scoreSums.a += (scores[username].a = passes / trials);

		if (success) {
			console.info(username, "passed part A");
		}
	}
}

const small_input = fs.readFileSync("small_input.log", "utf8");
const small_input2 = fs.readFileSync("small_input2.log", "utf8");

function partB(log, use_floor) {
	log = log.trim().split("\n").map(line => line.split(" "));

	let responses = new Set();
	const average = Math[use_floor? "floor" : "round"](log.reduce((prev, [,,,,,,,,,contentSize]) => {
		let parsed = parseInt(contentSize);
		return isNaN(parsed)? prev : prev + parsed;
	}, 0) / log.length);
	log.forEach(([,,,,,,,,response]) => responses.add(response));

	return `${average}\n${responses.size}`;
}

const bTests = {"small_input.log": small_input, "small_input2.log": small_input2};

if (GRADE_B) {
	for (const [username, filename] of submissions.b) {
		let success = true;

		let trials = 0;
		let passes = 0;
		for (const [logname, logvalue] of Object.entries(bTests)) {
			fs.writeFileSync(logname, logvalue);
			++trials;
			try {
				const output = execSync(`bash submissions/${filename} ${logname}`, {encoding: "utf8"}).trim();
				const expectedRound = partB(logvalue, false);
				const expectedFloor = partB(logvalue, true);
				if (output != expectedRound && output != expectedFloor) {
					console.error(username, "failed part B:", {expected: expectedRound, output});
					success = false;
				} else {
					++passes;
				}
			} catch(e) {
				console.error(`Error executing ${username}'s part B`);
				success = false;
				if (e.stderr.indexOf("$'\\r': command not found") != -1) {
					comments[username].add("Used CRLF endings in log_analyzer.sh");
				}
			}
		}

		++totalScores.b;
		scoreSums.b += (scores[username].b = 2 * passes / trials);

		if (success) {
			console.info(username, "passed part B");
		}
	}
}

String.prototype.hashCode = function() { // Credit: https://stackoverflow.com/a/7616484
	let hash = 0;
	if (this.length === 0)
		return hash;
	for (let i = 0; i < this.length; ++i) {
		const chr = this.charCodeAt(i);
		hash = ((hash << 5) - hash) + chr;
		hash |= 0; // Convert to 32bit integer
	}
	return hash;
}

Array.prototype.shrink = function(target) {
	for (let i = 0; this.length > target; ++i) {
		// this.splice(Math.floor(this.length / 5 * (1 + (i++ % 4))), 1);
		this.splice(this.length.toString().hashCode() % this.length, 1);
	}
	return this;
};

const covidCsv = fs.readFileSync("covidVaccines_orig.csv", "utf8");

function partC(text, k, insensitive) {
	let data = text.trim().split("\n").slice(1).map(line => line.split(",")).map(([,,,county,state,percent]) => [county, state, parseFloat(percent)]).filter(([,,percent]) => !isNaN(percent));

	data.sort(([countyA, stateA, percentA], [countyB, stateB, percentB]) => {
		if (percentA < percentB)
			return 1;
		if (percentA > percentB)
			return -1;
		if (insensitive) {
			if (countyA.toLowerCase().replace(/\s/g, "") < countyB.toLowerCase().replace(/\s/g, ""))
				return -1;
			if (countyA.toLowerCase().replace(/\s/g, "") > countyB.toLowerCase().replace(/\s/g, ""))
				return 1;
		} else {
			if (countyA < countyB)
				return -1;
			if (countyA > countyB)
				return 1;
		}
		return 0;
	});

	return data.map(item => item.join(",")).unique().slice(0, k).join("\n");
}

let covidSliced, cTests;

if (GRADE_C) {
	console.info("Producing sliced vaccine data.");
	covidSliced = "Header\n" + covidCsv.split("\n").slice(1).shrink(1000).join("\n");
	console.info("Producing part C test cases.");
	cTests = [
		["covid1.csv", covidCsv,    partC(covidCsv,    100, false), partC(covidCsv,    100, true)],
		["covid2.csv", covidSliced, partC(covidSliced, 100, false), partC(covidSliced, 100, true)]
	];
	console.info("Produced part C test cases.");
}

if (GRADE_C) {
	for (const [username, filename] of submissions.c) {
		let success = true;
		let trials = 0;
		let passes = 0;

		console.log(`Trying ${username}'s part C.`);

		for (const [csvname, text, expected, expectedInsensitive] of cTests) {
			fs.writeFileSync(csvname, text);
			++trials;
			try {
				const output = execSync(`bash submissions/${filename} ${csvname} 100`, {encoding: "utf8", timeout: 45000}).trim();
				if (output != expected && output != expectedInsensitive) {
					console.error(username, `failed part C test ${csvname}:`, {expectedLength: expected.length, outputLength: output.length});
					success = false;
				} else {
					++passes;
					console.log(username, "passed a part C test case.");
				}
			} catch(e) {
				console.error(`Error executing ${username}'s part C`, e);
				success = false;
				if (e.toString().indexOf("ETIMEDOUT") != -1) {
					comments[username].add("Part C timed out; manual test required.");
				}
				if (e.stderr.indexOf("$'\\r': command not found") != -1) {
					comments[username].add("Used CRLF endings in get_top_fully_vaccinated.sh");
				}
			}
		}

		++totalScores.c;
		scoreSums.c += (scores[username].c = 3 * passes / trials);

		if (success) {
			console.info(username, "passed part C");
		}
	}
}

console.log("\n\n\n\n\n\n\n\n\n\n\n\n\n\n\x1b[32mTesting complete.\x1b[39m\n\n");

Object.entries(comments).forEach(([username, set]) => {
	if (0 < set.size) {
		console.log(`\nComments for ${username}:`);
		set.forEach(comment => console.log(` - ${comment}`));
		console.log("");
	}
});

function fix(x) {
	return x === null? "?" : x;
}

console.log("Note: ? = nothing submitted; enter as 0.\n");

if (0 < late.size) {
	console.log("Late students:", [...late.values()].join(", "));
}

console.log("Do not assign a late penalty for:", [...excused].join(", ") + "\n");

const eq = "\x1b[2m = \x1b[22m";

for (const [username, {a, b, c}] of Object.entries(scores)) {
	console.log(`Score for \x1b[1m${username}\x1b[22m:\n    A${eq + fix(a)}\n    B${eq + fix(b)}\n    C${eq + fix(c)}\n    Total = ${(a || 0) + (b || 0) + (c || 0)} out of 6\n`);
}

if (totalScores.a)
	console.info(`Average score for part A: ${scoreSums.a / totalScores.a} out of 1`);

if (totalScores.b)
	console.info(`Average score for part B: ${scoreSums.b / totalScores.b} out of 2`);

if (totalScores.c)
	console.info(`Average score for part C: ${scoreSums.c / totalScores.c} out of 3`);

console.log("");

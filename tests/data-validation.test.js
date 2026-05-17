const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = {};
require(path.join(__dirname, "..", "src", "data.js"));

const data = global.window.GEOGRAPHY_GAME_DATA;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function collectRegionIds(gameData) {
  const ids = new Set();

  for (const geometry of gameData.topology.objects.countries.geometries) {
    const name = geometry.properties?.name || `Country ${geometry.id}`;
    const sourceId = geometry.id == null ? null : String(geometry.id);
    const id =
      gameData.countryIdOverrides?.[sourceId] ||
      gameData.countryNameOverrides?.[name] ||
      slugify(name);

    ids.add(id);
  }

  for (const region of gameData.extraRegions || []) {
    ids.add(region.id);
  }

  return ids;
}

function getFlagCodepoints(clue) {
  const characters = Array.from(String(clue || "").trim());
  const isFlag =
    characters.length === 2 &&
    characters.every((character) => {
      const codepoint = character.codePointAt(0);
      return codepoint >= 0x1f1e6 && codepoint <= 0x1f1ff;
    });

  return isFlag
    ? characters.map((character) => character.codePointAt(0).toString(16)).join("-")
    : "";
}

function validate() {
  assert.ok(data, "GEOGRAPHY_GAME_DATA should be exported on window");
  assert.ok(data.topology?.objects?.countries, "country topology should be present");
  assert.ok(Array.isArray(data.questions), "questions should be an array");
  assert.ok(data.questions.length > 0, "questions should not be empty");

  const regionIds = collectRegionIds(data);
  const questionIds = new Set();
  const failures = [];

  data.questions.forEach((question, index) => {
    const label = question?.id || `question at index ${index}`;

    if (!question || typeof question !== "object") {
      failures.push(`Question ${index} is not an object.`);
      return;
    }

    if (typeof question.id !== "string" || question.id.trim() === "") {
      failures.push(`${label}: id must be a non-empty string.`);
    } else if (questionIds.has(question.id)) {
      failures.push(`${label}: duplicate question id.`);
    } else {
      questionIds.add(question.id);
    }

    if (typeof question.type !== "string" || question.type.trim() === "") {
      failures.push(`${label}: type must be a non-empty string.`);
    }

    if (!Number.isFinite(question.points) || question.points <= 0) {
      failures.push(`${label}: points must be a positive number.`);
    }

    if (typeof question.prompt !== "string" || question.prompt.trim() === "") {
      failures.push(`${label}: prompt must be a non-empty string.`);
    }

    if (typeof question.clue !== "string" || question.clue.trim() === "") {
      failures.push(`${label}: clue must be a non-empty string.`);
    } else {
      const flagCodepoints = getFlagCodepoints(question.clue);
      if (flagCodepoints) {
        const flagAssetPath = path.join(
          __dirname,
          "..",
          "assets",
          "flags",
          `${flagCodepoints}.svg`,
        );
        if (!fs.existsSync(flagAssetPath)) {
          failures.push(`${label}: missing flag asset assets/flags/${flagCodepoints}.svg.`);
        }
      }
    }

    if (!Array.isArray(question.answers) || question.answers.length === 0) {
      failures.push(`${label}: answers must be a non-empty array.`);
      return;
    }

    const seenAnswers = new Set();
    question.answers.forEach((answer) => {
      if (typeof answer !== "string" || answer.trim() === "") {
        failures.push(`${label}: answer ids must be non-empty strings.`);
        return;
      }

      if (seenAnswers.has(answer)) {
        failures.push(`${label}: duplicate answer id "${answer}".`);
      }
      seenAnswers.add(answer);

      if (!regionIds.has(answer)) {
        failures.push(`${label}: answer id "${answer}" does not match a map region.`);
      }
    });
  });

  assert.equal(
    failures.length,
    0,
    failures.length ? `Data validation failed:\n${failures.join("\n")}` : undefined,
  );

  console.log(
    `Validated ${data.questions.length} questions against ${regionIds.size} map regions.`,
  );
}

validate();

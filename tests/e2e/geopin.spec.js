const { expect, test } = require("@playwright/test");

async function openGame(page) {
  const failures = [];

  page.on("pageerror", (error) => {
    failures.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(message.text());
    }
  });

  await page.addInitScript(() => {
    window.__GEOPIN_ENABLE_TEST_HOOKS__ = true;
    localStorage.clear();
  });
  await page.goto("/");
  await expect(page.locator("#world-map")).toBeVisible();
  await expect(page.locator("#question-text")).not.toHaveText("");

  return failures;
}

async function expectNoRuntimeFailures(failures) {
  expect(failures, "browser console/page errors").toEqual([]);
}

test("renders the playable map and dashboard", async ({ page }) => {
  const failures = await openGame(page);

  await expect(page.locator("h1")).toHaveText("GeoPin");
  await expect(page.locator("#mode-map")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#land-layer path").first()).toBeVisible();
  await expect(page.locator("#daily-trend .trend-day")).toHaveCount(14);
  await expect(page.locator("#lifetime-accuracy")).toHaveText("0%");
  await expect(page.locator("#recent-history .empty-state")).toBeVisible();

  await expectNoRuntimeFailures(failures);
});

test("can answer a deterministic map question", async ({ page }) => {
  const failures = await openGame(page);

  await page.evaluate(() => {
    const testApi = window.__GEOPIN_TEST__;
    testApi.setQuestions([
      {
        id: "test-united-states",
        type: "Test",
        points: 100,
        clue: "Test clue",
        prompt: "Click the United States.",
        answers: ["united-states"],
      },
    ]);
    testApi.answerAt(testApi.project([-98, 39]));
  });

  await expect(page.locator("#feedback")).toContainText("Correct: United States");
  await expect(page.locator("#score")).toHaveText("100");
  await expect(page.locator("#streak")).toHaveText("1");
  await expect(page.locator("#next-button")).toBeEnabled();
  await expect(page.locator("#pin-layer .pin")).toHaveCount(1);

  await expectNoRuntimeFailures(failures);
});

test("supports outline mode text answers", async ({ page }) => {
  const failures = await openGame(page);

  await page.locator("#mode-outline").click();
  await expect(page.locator("#mode-outline")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#world-map")).toBeHidden();
  await expect(page.locator("#outline-stage")).toBeVisible();
  await expect(page.locator("#answer-form")).toBeVisible();
  await expect(page.locator("#outline-layer path").first()).toBeVisible();

  const acceptedAnswer = await page.evaluate(
    () => window.__GEOPIN_TEST__.getCurrentQuestion().acceptedAnswers[0],
  );
  await page.locator("#country-answer").fill(acceptedAnswer);
  await page.locator("#submit-answer").click();

  await expect(page.locator("#feedback")).toContainText("Correct:");
  await expect(page.locator("#outline-layer")).toHaveClass(/is-correct/);
  await expect(page.locator("#next-button")).toBeEnabled();

  await expectNoRuntimeFailures(failures);
});

test("zoom controls update the map viewBox", async ({ page }) => {
  const failures = await openGame(page);
  const before = await page.locator("#world-map").getAttribute("viewBox");

  await page.locator("#zoom-in").click();

  await expect
    .poll(() => page.locator("#world-map").getAttribute("viewBox"))
    .not.toBe(before);

  const after = await page.locator("#world-map").getAttribute("viewBox");
  const beforeWidth = Number(before.split(/\s+/)[2]);
  const afterWidth = Number(after.split(/\s+/)[2]);
  expect(afterWidth).toBeLessThan(beforeWidth);

  await expectNoRuntimeFailures(failures);
});

test("keeps key UI regions contained without horizontal page overflow", async ({ page }) => {
  const failures = await openGame(page);
  const layout = await page.evaluate(() => {
    const selectors = [
      ".game-shell",
      ".hud",
      ".question-panel",
      ".map-stage",
      "#world-map",
      ".progress-panel",
    ];
    const boxes = selectors.map((selector) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      return {
        selector,
        width: rect.width,
        height: rect.height,
      };
    });
    const stage = document.querySelector(".map-stage").getBoundingClientRect();
    const toolbar = document.querySelector(".map-toolbar").getBoundingClientRect();
    const visibleButtonOverflows = Array.from(document.querySelectorAll("button"))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .filter((button) => button.scrollWidth > button.clientWidth + 1)
      .map((button) => button.id || button.textContent.trim());

    return {
      boxes,
      pageOverflowsX:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      toolbarContained:
        toolbar.left >= stage.left &&
        toolbar.right <= stage.right &&
        toolbar.top >= stage.top &&
        toolbar.bottom <= stage.bottom,
      visibleButtonOverflows,
    };
  });

  expect(layout.pageOverflowsX, "page should not overflow horizontally").toBe(false);
  expect(layout.toolbarContained, "map toolbar should stay inside the map stage").toBe(true);
  expect(layout.visibleButtonOverflows, "visible button text should fit").toEqual([]);
  for (const box of layout.boxes) {
    expect(box.width, `${box.selector} width`).toBeGreaterThan(0);
    expect(box.height, `${box.selector} height`).toBeGreaterThan(0);
  }

  await expectNoRuntimeFailures(failures);
});

(function () {
  "use strict";

  const MAP_WIDTH = 1000;
  const MAP_HEIGHT = 500;
  const MIN_VIEW_WIDTH = 90;
  const MAX_VIEW_WIDTH = MAP_WIDTH;
  const ANSWER_SLOP_PX = 18;
  const EARTH_RADIUS_KM = 6371;
  const GAME_MODES = {
    MAP: "map",
    OUTLINE: "outline",
  };
  const OUTLINE_ROUNDS = 20;
  const OUTLINE_POINTS = 120;
  const OUTLINE_VIEW_WIDTH = 420;
  const OUTLINE_VIEW_HEIGHT = 320;
  const OUTLINE_PADDING = 34;
  const OUTLINE_MIN_PROJECTED_AREA = 14;
  const STREAK_BONUS_POINTS = 10;
  const TERRAIN_HINT_SCORE_MULTIPLIER = 0.5;
  const PROGRESS_STORAGE_KEY = "geopin-progress-v1";
  const RECENT_ATTEMPT_LIMIT = 100;
  const RECENT_FORM_LIMIT = 20;
  const RECENT_HISTORY_LIMIT = 10;
  const TREND_DAYS = 14;
  const SUMMARY_LIST_LIMIT = 5;
  const TWEMOJI_FLAG_BASE_URL = "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/svg/";
  const COUNTRY_ANSWER_ALIASES = {
    "bosnia-and-herzegovina": ["bosnia", "bosnia herzegovina"],
    "cabo-verde": ["cape verde"],
    congo: ["republic of the congo", "congo brazzaville"],
    "c-te-d-ivoire": ["ivory coast"],
    czechia: ["czech republic"],
    "democratic-republic-of-the-congo": [
      "drc",
      "dr congo",
      "congo kinshasa",
      "democratic republic of congo",
    ],
    eswatini: ["swaziland"],
    macedonia: ["north macedonia"],
    myanmar: ["burma"],
    "north-korea": ["dprk"],
    russia: ["russian federation"],
    "south-korea": ["republic of korea"],
    "united-kingdom": ["uk", "u k", "great britain", "britain"],
    "united-states": ["usa", "u s a", "us", "u s", "america"],
  };
  const SVG_NS = "http://www.w3.org/2000/svg";

  const data = window.GEOGRAPHY_GAME_DATA;
  const geography = buildGeography(data);
  const regionById = new Map(geography.regions.map((region) => [region.id, region]));

  const elements = {
    svg: document.querySelector("#world-map"),
    landLayer: document.querySelector("#land-layer"),
    answerLayer: document.querySelector("#answer-layer"),
    pinLayer: document.querySelector("#pin-layer"),
    terrainLayer: document.querySelector("#terrain-layer"),
    score: document.querySelector("#score"),
    streak: document.querySelector("#streak"),
    round: document.querySelector("#round"),
    questionType: document.querySelector("#question-type"),
    questionPoints: document.querySelector("#question-points"),
    questionPanel: document.querySelector(".question-panel"),
    questionClue: document.querySelector("#question-clue"),
    questionText: document.querySelector("#question-text"),
    answerForm: document.querySelector("#answer-form"),
    countryAnswer: document.querySelector("#country-answer"),
    submitAnswer: document.querySelector("#submit-answer"),
    feedback: document.querySelector("#feedback"),
    nextButton: document.querySelector("#next-button"),
    restartButton: document.querySelector("#restart-button"),
    modeMap: document.querySelector("#mode-map"),
    modeOutline: document.querySelector("#mode-outline"),
    mapStage: document.querySelector(".map-stage"),
    mapToolbar: document.querySelector(".map-toolbar"),
    outlineStage: document.querySelector("#outline-stage"),
    outlineLayer: document.querySelector("#outline-layer"),
    zoomIn: document.querySelector("#zoom-in"),
    zoomOut: document.querySelector("#zoom-out"),
    zoomReset: document.querySelector("#zoom-reset"),
    terrainHint: document.querySelector("#terrain-hint"),
    clearProgress: document.querySelector("#clear-progress"),
    lifetimeAccuracy: document.querySelector("#lifetime-accuracy"),
    lifetimeAnswered: document.querySelector("#lifetime-answered"),
    bestStreak: document.querySelector("#best-streak"),
    bestScore: document.querySelector("#best-score"),
    recentAccuracy: document.querySelector("#recent-accuracy"),
    todayAnswered: document.querySelector("#today-answered"),
    mapAccuracy: document.querySelector("#map-accuracy"),
    outlineAccuracy: document.querySelector("#outline-accuracy"),
    dailyTrend: document.querySelector("#daily-trend"),
    categoryStats: document.querySelector("#category-stats"),
    focusStats: document.querySelector("#focus-stats"),
    strongStats: document.querySelector("#strong-stats"),
    recentHistory: document.querySelector("#recent-history"),
  };

  const state = {
    mode: GAME_MODES.MAP,
    questions: [],
    currentIndex: 0,
    score: 0,
    streak: 0,
    answered: false,
    foundAnswerIds: [],
    remainingAnswerIds: [],
    terrainHintVisible: false,
    terrainHintUsed: false,
    progress: loadProgress(),
    view: { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT },
    pointer: null,
  };

  installTestHooks();
  init();

  function installTestHooks() {
    if (!window.__GEOPIN_ENABLE_TEST_HOOKS__) {
      return;
    }

    window.__GEOPIN_TEST__ = {
      GAME_MODES,
      get geography() {
        return geography;
      },
      get regionById() {
        return regionById;
      },
      get state() {
        return state;
      },
      answerAt,
      answerText,
      getCurrentQuestion,
      getRegionProjectedBounds,
      project,
      setMode,
      setQuestions,
      unproject,
    };
  }

  function setQuestions(questions, mode = GAME_MODES.MAP) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("Test questions must be a non-empty array.");
    }

    state.mode = mode;
    state.questions = questions.map((question, index) =>
      normalizeTestQuestion(question, index, mode),
    );
    state.currentIndex = 0;
    state.score = 0;
    state.streak = 0;
    state.answered = false;
    state.foundAnswerIds = [];
    state.remainingAnswerIds = [];
    updateModeControls();
    resetView();
    renderQuestion();
  }

  function normalizeTestQuestion(question, index, mode) {
    const answers = (Array.isArray(question.answers)
      ? question.answers
      : [question.answers]).filter((answer) => typeof answer === "string" && answer);

    if (!answers.length) {
      throw new Error(`Test question ${index} must include at least one answer id.`);
    }

    const normalized = {
      id: question.id || `test-question-${index}`,
      type: question.type || "Test",
      points: Number.isFinite(question.points) ? question.points : 100,
      clue: question.clue || "Test clue",
      clueLabel: question.clueLabel || question.clue || "Test clue",
      prompt: question.prompt || "Test question",
      answers: answers.slice(),
    };

    if (mode === GAME_MODES.OUTLINE) {
      const regionId = question.regionId || answers[0];
      const region = regionById.get(regionId);
      normalized.mode = GAME_MODES.OUTLINE;
      normalized.regionId = regionId;
      normalized.acceptedAnswers = Array.isArray(question.acceptedAnswers)
        ? question.acceptedAnswers.slice()
        : region
          ? buildAcceptedAnswers(region)
          : [];
      normalized.outlineTransform = question.outlineTransform || {
        angle: 0,
        mirrorX: false,
        mirrorY: false,
      };
    }

    return normalized;
  }

  function init() {
    drawLand();
    bindEvents();
    updateModeControls();
    restartGame();
  }

  function bindEvents() {
    elements.nextButton.addEventListener("click", nextQuestion);
    elements.restartButton.addEventListener("click", restartGame);
    elements.modeMap.addEventListener("click", () => setMode(GAME_MODES.MAP));
    elements.modeOutline.addEventListener("click", () => setMode(GAME_MODES.OUTLINE));
    elements.answerForm.addEventListener("submit", handleTextAnswerSubmit);
    elements.zoomIn.addEventListener("click", () => zoomAtCenter(0.58));
    elements.zoomOut.addEventListener("click", () => zoomAtCenter(1.72));
    elements.zoomReset.addEventListener("click", resetView);
    elements.terrainHint.addEventListener("click", toggleTerrainHint);
    elements.clearProgress.addEventListener("click", clearProgressHistory);

    elements.svg.addEventListener("pointerdown", handlePointerDown);
    elements.svg.addEventListener("pointermove", handlePointerMove);
    elements.svg.addEventListener("pointerup", handlePointerUp);
    elements.svg.addEventListener("pointercancel", clearPointer);
    elements.svg.addEventListener("wheel", handleWheel, { passive: false });
  }

  function setMode(mode) {
    if (state.mode === mode) {
      return;
    }

    state.mode = mode;
    updateModeControls();
    restartGame();
  }

  function updateModeControls() {
    elements.modeMap.setAttribute(
      "aria-pressed",
      String(state.mode === GAME_MODES.MAP),
    );
    elements.modeOutline.setAttribute(
      "aria-pressed",
      String(state.mode === GAME_MODES.OUTLINE),
    );
  }

  function toggleTerrainHint() {
    if (state.mode !== GAME_MODES.MAP || state.answered) {
      return;
    }

    state.terrainHintVisible = !state.terrainHintVisible;

    if (state.terrainHintVisible) {
      state.terrainHintUsed = true;
    }

    updateTerrainHintUI();
    renderQuestionPoints(getCurrentQuestion(), isMultiAnswerQuestion(getCurrentQuestion()));
  }

  function resetTerrainHint() {
    state.terrainHintVisible = false;
    state.terrainHintUsed = false;
    updateTerrainHintUI();
  }

  function updateTerrainHintUI() {
    const isActive = state.mode === GAME_MODES.MAP && state.terrainHintVisible;

    setHidden(elements.terrainLayer, !isActive);
    elements.svg.classList.toggle("has-terrain-hint", isActive);
    elements.terrainHint.setAttribute("aria-pressed", String(isActive));
    elements.terrainHint.disabled = state.mode !== GAME_MODES.MAP || state.answered;
  }

  function restartGame() {
    state.questions =
      state.mode === GAME_MODES.OUTLINE
        ? createOutlineQuestions()
        : shuffle(data.questions).slice();
    state.currentIndex = 0;
    state.score = 0;
    state.streak = 0;
    state.answered = false;
    resetView();
    renderQuestion();
  }

  function renderQuestion() {
    const question = getCurrentQuestion();
    const isOutlineMode = state.mode === GAME_MODES.OUTLINE;
    const isMultiAnswer = isMultiAnswerQuestion(question);

    state.answered = false;
    state.foundAnswerIds = [];
    state.remainingAnswerIds = question.answers.slice();
    resetTerrainHint();
    elements.answerLayer.replaceChildren();
    elements.pinLayer.replaceChildren();
    elements.outlineLayer.replaceChildren();
    elements.outlineLayer.classList.remove("is-correct", "is-wrong");
    elements.nextButton.disabled = !isMultiAnswer;
    elements.nextButton.textContent = isMultiAnswer ? "Done" : "Next";
    elements.feedback.className = "feedback";
    elements.feedback.textContent = "";
    elements.countryAnswer.value = "";
    elements.countryAnswer.disabled = !isOutlineMode;
    elements.submitAnswer.disabled = !isOutlineMode;

    elements.questionType.textContent = question.type;
    renderQuestionPoints(question, isMultiAnswer);
    elements.questionText.textContent = question.prompt;
    elements.questionPanel.classList.toggle("is-outline", isOutlineMode);
    elements.mapStage.classList.toggle("is-outline", isOutlineMode);
    setHidden(elements.answerForm, !isOutlineMode);
    setHidden(elements.mapToolbar, isOutlineMode);
    setHidden(elements.svg, isOutlineMode);
    setHidden(elements.outlineStage, !isOutlineMode);
    setHidden(elements.questionClue, isOutlineMode);

    if (isOutlineMode) {
      drawOutlineQuestion(question);
      requestAnimationFrame(() => elements.countryAnswer.focus());
    } else {
      renderQuestionClue(question);
    }

    updateStats();
    renderProgress();
  }

  function renderQuestionClue(question) {
    const flagImageUrl = getFlagImageUrl(question.clue);

    elements.questionClue.replaceChildren();
    elements.questionClue.setAttribute("aria-label", question.clueLabel || question.clue);
    elements.questionClue.classList.toggle("is-text", !flagImageUrl);
    elements.questionClue.classList.toggle("has-flag-image", Boolean(flagImageUrl));

    if (!flagImageUrl) {
      elements.questionClue.textContent = question.clue;
      return;
    }

    const flag = document.createElement("span");
    flag.className = "flag-clue is-fallback";

    const image = document.createElement("img");
    image.className = "flag-clue-image";
    image.alt = question.clueLabel || "Flag";
    image.decoding = "async";
    image.loading = "eager";
    image.referrerPolicy = "no-referrer";
    image.addEventListener(
      "load",
      () => {
        flag.classList.remove("is-fallback");
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        flag.classList.add("is-fallback");
      },
      { once: true },
    );
    image.src = flagImageUrl;

    const fallback = document.createElement("span");
    fallback.className = "flag-clue-fallback";
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = getFlagCountryCode(question.clue) || question.clue;

    flag.append(image, fallback);
    elements.questionClue.append(flag);
  }

  function nextQuestion() {
    if (!state.answered) {
      if (isMultiAnswerQuestion(getCurrentQuestion())) {
        finishMultiAnswerQuestion();
      }
      return;
    }

    if (state.currentIndex >= state.questions.length - 1) {
      restartGame();
      return;
    }

    state.currentIndex += 1;
    renderQuestion();
  }

  function createOutlineQuestions() {
    const candidates = geography.regions
      .filter(isOutlineCandidate)
      .sort((left, right) => left.name.localeCompare(right.name));

    return shuffle(candidates)
      .slice(0, Math.min(OUTLINE_ROUNDS, candidates.length))
      .map((region, index) => ({
        id: `outline-${region.id}-${index}`,
        mode: GAME_MODES.OUTLINE,
        type: "Outline",
        points: OUTLINE_POINTS,
        prompt: "Name this country.",
        answers: [region.id],
        regionId: region.id,
        acceptedAnswers: buildAcceptedAnswers(region),
        outlineTransform: createOutlineTransform(),
      }));
  }

  function isOutlineCandidate(region) {
    return region.kind === "country" && getProjectedRegionArea(region) >= OUTLINE_MIN_PROJECTED_AREA;
  }

  function createOutlineTransform() {
    return {
      angle: Math.round(Math.random() * 359),
      mirrorX: Math.random() < 0.5,
      mirrorY: Math.random() < 0.18,
    };
  }

  function buildAcceptedAnswers(region) {
    const answers = new Set([
      normalizeTypedAnswer(region.name),
      normalizeTypedAnswer(region.id.replace(/-/g, " ")),
    ]);

    (COUNTRY_ANSWER_ALIASES[region.id] || []).forEach((alias) => {
      answers.add(normalizeTypedAnswer(alias));
    });

    return Array.from(answers).filter(Boolean);
  }

  function isMultiAnswerQuestion(question) {
    return state.mode === GAME_MODES.MAP && question.answers.length > 1;
  }

  function renderQuestionPoints(question, isMultiAnswer) {
    const hasHintPenalty = state.mode === GAME_MODES.MAP && state.terrainHintUsed;
    const points = hasHintPenalty
      ? applyTerrainHintPenalty(question.points)
      : question.points;
    const suffix = isMultiAnswer ? "pts each" : "pts";

    elements.questionPoints.textContent = hasHintPenalty
      ? `${points} ${suffix} with hint`
      : `${points} ${suffix}`;
  }

  function getAnswerPoints(question) {
    const points = question.points + state.streak * STREAK_BONUS_POINTS;

    return state.mode === GAME_MODES.MAP && state.terrainHintUsed
      ? applyTerrainHintPenalty(points)
      : points;
  }

  function applyTerrainHintPenalty(points) {
    return Math.floor(points * TERRAIN_HINT_SCORE_MULTIPLIER);
  }

  function markAnswerFound(regionId) {
    if (!state.foundAnswerIds.includes(regionId)) {
      state.foundAnswerIds.push(regionId);
    }

    state.remainingAnswerIds = state.remainingAnswerIds.filter((answerId) => answerId !== regionId);
  }

  function findFoundAnswerRegion(point, clickedRegions) {
    const clickedFoundRegion = clickedRegions.find((region) =>
      state.foundAnswerIds.includes(region.id),
    );

    if (clickedFoundRegion) {
      return clickedFoundRegion;
    }

    return clickedRegions.length
      ? null
      : findNearbyAnswerRegion(point, state.foundAnswerIds);
  }

  function getCorrectAnswerFeedback(region, earned, question) {
    if (!isMultiAnswerQuestion(question)) {
      return `Correct: ${region.name}. +${earned} points.`;
    }

    const remainingCount = state.remainingAnswerIds.length;
    if (!remainingCount) {
      return `Correct: ${region.name}. +${earned} points. All answers found.`;
    }

    return `Correct: ${region.name}. +${earned} points. ${formatAnswerCount(remainingCount)} remaining.`;
  }

  function getDoneFeedback(question, remainingIds) {
    const foundCount = state.foundAnswerIds.length;
    const totalCount = question.answers.length;

    if (!remainingIds.length) {
      return `Done. Found all ${formatAnswerCount(totalCount)}.`;
    }

    if (!foundCount) {
      return `Done. Answers: ${formatRegionList(remainingIds)}.`;
    }

    return `Done. Found ${foundCount} of ${totalCount}. Remaining answers: ${formatRegionList(remainingIds)}.`;
  }

  function formatAnswerCount(count) {
    return `${count} answer${count === 1 ? "" : "s"}`;
  }

  function answerAt(point) {
    if (state.mode !== GAME_MODES.MAP || state.answered) {
      return;
    }

    const question = getCurrentQuestion();
    const isMultiAnswer = isMultiAnswerQuestion(question);
    const answerIds = isMultiAnswer ? state.remainingAnswerIds : question.answers;
    const lonLat = unproject(point);
    const clickedRegions = findRegions(lonLat);
    const forgivingAnswer = clickedRegions.length
      ? null
      : findNearbyAnswerRegion(point, answerIds);
    const correctRegion =
      clickedRegions.find((region) => answerIds.includes(region.id)) || forgivingAnswer;
    const clickedRegion = correctRegion || clickedRegions[0];
    const isCorrect = Boolean(correctRegion);

    if (isMultiAnswer && !isCorrect) {
      const foundRegion = findFoundAnswerRegion(point, clickedRegions);
      if (foundRegion) {
        elements.feedback.className = "feedback good";
        elements.feedback.textContent = `Already found: ${foundRegion.name}.`;
        return;
      }
    }

    addPin(point, isCorrect, !isMultiAnswer);

    if (clickedRegion && !isCorrect) {
      showAnswerZones([clickedRegion.id], "wrong");
    }

    if (isCorrect) {
      const earned = getAnswerPoints(question);
      state.score += earned;
      state.streak += 1;
      elements.feedback.className = "feedback good";
      showAnswerZones([correctRegion.id], "correct");
      markAnswerFound(correctRegion.id);
      elements.feedback.textContent = getCorrectAnswerFeedback(correctRegion, earned, question);
      recordAnswer(question, {
        isCorrect,
        earned,
        guessLabel: correctRegion.name,
        matchedRegionId: correctRegion.id,
      });

      if (isMultiAnswer && state.remainingAnswerIds.length > 0) {
        updateStats();
        renderProgress();
        return;
      }
    } else {
      const missedAnswerIds = isMultiAnswer ? state.remainingAnswerIds : question.answers;
      const missDistance = showMissDistance(point, missedAnswerIds);
      const clicked = describeClickedArea(lonLat, clickedRegion);
      const answers = formatRegionList(missedAnswerIds);
      const distanceText = missDistance ? ` You were ${missDistance.distanceText} away.` : "";
      state.streak = 0;
      elements.feedback.className = "feedback bad";
      showAnswerZones(missedAnswerIds, "correct");
      elements.feedback.textContent = isMultiAnswer && state.foundAnswerIds.length > 0
        ? `No: that was ${clicked}. Remaining answers: ${answers}.${distanceText}`
        : `No: that was ${clicked}. Answer: ${answers}.${distanceText}`;
      recordAnswer(question, {
        isCorrect,
        earned: 0,
        guessLabel: clicked,
        guessedRegionId: clickedRegion?.id || null,
        distanceKm: missDistance?.distanceKm || null,
      });
    }

    finishAnswer();
  }

  function handleTextAnswerSubmit(event) {
    event.preventDefault();
    answerText(elements.countryAnswer.value);
  }

  function answerText(value) {
    if (state.mode !== GAME_MODES.OUTLINE || state.answered) {
      return;
    }

    const normalizedAnswer = normalizeTypedAnswer(value);
    if (!normalizedAnswer) {
      elements.countryAnswer.focus();
      return;
    }

    const question = getCurrentQuestion();
    const region = regionById.get(question.regionId);
    const isCorrect = question.acceptedAnswers.includes(normalizedAnswer);

    elements.countryAnswer.disabled = true;
    elements.submitAnswer.disabled = true;
    elements.outlineLayer.classList.toggle("is-correct", isCorrect);
    elements.outlineLayer.classList.toggle("is-wrong", !isCorrect);

    if (isCorrect) {
      const earned = getAnswerPoints(question);
      state.score += earned;
      state.streak += 1;
      elements.feedback.className = "feedback good";
      elements.feedback.textContent = `Correct: ${region.name}. +${earned} points.`;
      recordAnswer(question, {
        isCorrect,
        earned,
        guessLabel: value.trim(),
        matchedRegionId: region.id,
      });
    } else {
      state.streak = 0;
      elements.feedback.className = "feedback bad";
      elements.feedback.textContent = `No: Answer: ${region.name}.`;
      recordAnswer(question, {
        isCorrect,
        earned: 0,
        guessLabel: value.trim(),
        matchedRegionId: null,
      });
    }

    finishAnswer();
  }

  function finishAnswer() {
    state.answered = true;
    updateTerrainHintUI();
    elements.nextButton.disabled = false;
    elements.nextButton.textContent =
      state.currentIndex >= state.questions.length - 1 ? "Play again" : "Next";
    updateStats();
    renderProgress();
  }

  function finishMultiAnswerQuestion() {
    const question = getCurrentQuestion();
    const foundCount = state.foundAnswerIds.length;
    const remainingIds = state.remainingAnswerIds.slice();

    if (remainingIds.length > 0) {
      showAnswerZones(remainingIds, "correct");
    }

    elements.feedback.className = foundCount > 0 ? "feedback good" : "feedback";
    elements.feedback.textContent = getDoneFeedback(question, remainingIds);
    finishAnswer();
  }

  function recordAnswer(question, result) {
    const now = new Date();
    const isCorrect = Boolean(result.isCorrect);
    const earned = asCount(result.earned);
    const progress = state.progress;
    const dayKey = getLocalDateKey(now);
    const questionLabel = getQuestionLabel(question);

    incrementProgressStats(progress.totals, isCorrect, earned);
    progress.totals.bestStreak = Math.max(progress.totals.bestStreak, state.streak);
    progress.totals.bestScore = Math.max(progress.totals.bestScore, state.score);

    incrementProgressStats(
      getProgressStats(progress.modes, state.mode, {
        label: formatModeName(state.mode),
      }),
      isCorrect,
      earned,
    );
    incrementProgressStats(
      getProgressStats(progress.types, question.type, {
        label: question.type,
      }),
      isCorrect,
      earned,
    );
    const questionStats = getProgressStats(progress.questions, question.id, {
      label: questionLabel,
      type: question.type,
      mode: state.mode,
    });
    incrementProgressStats(questionStats, isCorrect, earned);
    questionStats.currentStreak = isCorrect ? questionStats.currentStreak + 1 : 0;
    questionStats.bestStreak = Math.max(questionStats.bestStreak, questionStats.currentStreak);
    questionStats.lastAnsweredAt = now.toISOString();

    if (isCorrect) {
      questionStats.lastCorrectAt = now.toISOString();
    }

    incrementProgressStats(
      getProgressStats(progress.days, dayKey, {
        label: dayKey,
      }),
      isCorrect,
      earned,
    );

    progress.recent.push({
      at: now.toISOString(),
      mode: state.mode,
      modeLabel: formatModeName(state.mode),
      type: question.type,
      questionId: question.id,
      questionLabel,
      prompt: question.prompt,
      answers: question.answers.map(getRegionName),
      guessLabel: result.guessLabel || "",
      isCorrect,
      earned,
      score: state.score,
      streak: state.streak,
      distanceKm: Number.isFinite(result.distanceKm) ? round(result.distanceKm) : null,
    });

    if (progress.recent.length > RECENT_ATTEMPT_LIMIT) {
      progress.recent.splice(0, progress.recent.length - RECENT_ATTEMPT_LIMIT);
    }

    saveProgress(progress);
  }

  function clearProgressHistory() {
    if (!window.confirm("Clear all saved progress statistics?")) {
      return;
    }

    state.progress = createEmptyProgress();
    saveProgress(state.progress);
    renderProgress();
  }

  function renderProgress() {
    const progress = state.progress;
    const todayStats = progress.days[getLocalDateKey(new Date())] || createProgressStats();
    const mapStats = progress.modes[GAME_MODES.MAP] || createProgressStats();
    const outlineStats = progress.modes[GAME_MODES.OUTLINE] || createProgressStats();

    elements.lifetimeAccuracy.textContent = formatAccuracy(progress.totals);
    elements.lifetimeAnswered.textContent = formatInteger(progress.totals.attempts);
    elements.bestStreak.textContent = formatInteger(progress.totals.bestStreak);
    elements.bestScore.textContent = formatInteger(progress.totals.bestScore);
    elements.recentAccuracy.textContent = formatRecentAccuracy(progress.recent);
    elements.todayAnswered.textContent = todayStats.attempts
      ? `${formatInteger(todayStats.attempts)} - ${formatAccuracy(todayStats)}`
      : "0";
    elements.mapAccuracy.textContent = formatAccuracy(mapStats);
    elements.outlineAccuracy.textContent = formatAccuracy(outlineStats);

    renderDailyTrend(progress);
    renderCategoryStats(progress);
    renderQuestionStatLists(progress);
    renderRecentHistory(progress);
  }

  function renderDailyTrend(progress) {
    const fragment = document.createDocumentFragment();
    const today = new Date();

    for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
      const date = addDays(today, -offset);
      const key = getLocalDateKey(date);
      const stats = progress.days[key] || createProgressStats();
      const accuracy = getAccuracy(stats);
      const day = document.createElement("div");
      const track = document.createElement("div");
      const bar = document.createElement("div");
      const label = document.createElement("div");

      day.className = "trend-day";
      track.className = "trend-bar-track";
      bar.className = "trend-bar";
      label.className = "trend-label";
      label.textContent = formatShortDate(date);

      if (stats.attempts) {
        bar.style.height = `${Math.max(6, Math.round(accuracy * 100))}%`;
        day.title = `${formatLongDate(date)}: ${stats.correct}/${stats.attempts} correct (${formatAccuracy(stats)})`;
      } else {
        bar.classList.add("is-empty");
        bar.style.height = "3px";
        day.title = `${formatLongDate(date)}: no answers`;
      }

      track.append(bar);
      day.append(track, label);
      fragment.append(day);
    }

    elements.dailyTrend.replaceChildren(fragment);
  }

  function renderCategoryStats(progress) {
    const categories = Object.values(progress.types)
      .filter((stats) => stats.attempts > 0)
      .sort((left, right) => right.attempts - left.attempts || getAccuracy(right) - getAccuracy(left))
      .slice(0, SUMMARY_LIST_LIMIT);

    renderStatsList(
      elements.categoryStats,
      categories.map((stats) => ({
        label: stats.label || "Unknown",
        value: formatAccuracy(stats),
        sub: `${formatInteger(stats.correct)}/${formatInteger(stats.attempts)} correct`,
        fill: getAccuracy(stats),
        low: getAccuracy(stats) < 0.5,
      })),
      "Answer questions to build category stats.",
    );
  }

  function renderQuestionStatLists(progress) {
    const questions = Object.values(progress.questions).filter((stats) => stats.attempts > 0);
    const focusAreas = questions
      .filter((stats) => stats.correct < stats.attempts)
      .sort(
        (left, right) =>
          getAccuracy(left) - getAccuracy(right) ||
          right.attempts - left.attempts ||
          compareLastAnswered(right, left),
      )
      .slice(0, SUMMARY_LIST_LIMIT);
    const strongAreas = questions
      .filter((stats) => stats.correct > 0)
      .sort(
        (left, right) =>
          getAccuracy(right) - getAccuracy(left) ||
          right.attempts - left.attempts ||
          compareLastAnswered(right, left),
      )
      .slice(0, SUMMARY_LIST_LIMIT);

    renderStatsList(
      elements.focusStats,
      focusAreas.map((stats) => questionStatsToRow(stats, true)),
      "Missed questions will appear here.",
    );
    renderStatsList(
      elements.strongStats,
      strongAreas.map((stats) => questionStatsToRow(stats, false)),
      "Correct answers will appear here.",
    );
  }

  function renderRecentHistory(progress) {
    const attempts = progress.recent.slice(-RECENT_HISTORY_LIMIT).reverse();
    const fragment = document.createDocumentFragment();

    if (!attempts.length) {
      renderEmptyState(elements.recentHistory, "Recent answers will appear here.");
      return;
    }

    attempts.forEach((attempt) => {
      const row = document.createElement("div");
      const mark = document.createElement("span");
      const text = document.createElement("div");
      const title = document.createElement("div");
      const meta = document.createElement("div");
      const result = attempt.isCorrect ? `Correct +${formatInteger(attempt.earned)}` : "Wrong";
      const details = [
        formatRelativeTime(attempt.at),
        result,
        `Answer: ${formatAnswerNames(attempt.answers)}`,
      ];

      if (!attempt.isCorrect && attempt.guessLabel) {
        details.push(`Guess: ${attempt.guessLabel}`);
      }

      if (!attempt.isCorrect && Number.isFinite(attempt.distanceKm)) {
        details.push(`${formatDistanceKm(attempt.distanceKm)} away`);
      }

      row.className = "history-row";
      mark.className = "history-mark";
      mark.classList.toggle("is-correct", attempt.isCorrect);
      text.className = "history-text";
      title.className = "history-title";
      meta.className = "history-meta";
      title.textContent = attempt.questionLabel;
      meta.textContent = details.filter(Boolean).join(" - ");
      text.append(title, meta);
      row.append(mark, text);
      fragment.append(row);
    });

    elements.recentHistory.replaceChildren(fragment);
  }

  function questionStatsToRow(stats, low) {
    return {
      label: stats.label || "Question",
      value: formatAccuracy(stats),
      sub: `${stats.type || "Question"} - ${formatInteger(stats.correct)}/${formatInteger(stats.attempts)} correct`,
      fill: getAccuracy(stats),
      low,
    };
  }

  function renderStatsList(container, rows, emptyText) {
    const fragment = document.createDocumentFragment();

    if (!rows.length) {
      renderEmptyState(container, emptyText);
      return;
    }

    rows.forEach((row) => {
      const item = document.createElement("div");
      const main = document.createElement("div");
      const label = document.createElement("div");
      const value = document.createElement("div");
      const sub = document.createElement("div");
      const bar = document.createElement("div");
      const fill = document.createElement("span");

      item.className = "stat-row";
      main.className = "stat-row-main";
      label.className = "stat-row-label";
      value.className = "stat-row-value";
      sub.className = "stat-row-sub";
      bar.className = "stat-bar";
      label.textContent = row.label;
      value.textContent = row.value;
      sub.textContent = row.sub;
      fill.style.setProperty("--fill", `${Math.round(row.fill * 100)}%`);
      fill.classList.toggle("is-low", row.low);
      bar.append(fill);
      main.append(label, value);
      item.append(main, sub, bar);
      fragment.append(item);
    });

    container.replaceChildren(fragment);
  }

  function renderEmptyState(container, text) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = text;
    container.replaceChildren(empty);
  }

  function loadProgress() {
    try {
      const saved = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
      return saved ? normalizeProgress(JSON.parse(saved)) : createEmptyProgress();
    } catch (error) {
      return createEmptyProgress();
    }
  }

  function saveProgress(progress) {
    try {
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    } catch (error) {
      // Progress tracking is optional when storage is unavailable.
    }
  }

  function normalizeProgress(saved) {
    const progress = createEmptyProgress();

    if (!isRecord(saved)) {
      return progress;
    }

    progress.totals = {
      ...progress.totals,
      ...normalizeProgressStats(saved.totals),
      bestStreak: asCount(saved.totals?.bestStreak),
      bestScore: asCount(saved.totals?.bestScore),
    };
    progress.modes = normalizeProgressCollection(saved.modes);
    progress.types = normalizeProgressCollection(saved.types);
    progress.questions = normalizeProgressCollection(saved.questions);
    progress.days = normalizeProgressCollection(saved.days);
    progress.recent = Array.isArray(saved.recent)
      ? saved.recent
          .filter(isRecord)
          .slice(-RECENT_ATTEMPT_LIMIT)
          .map(normalizeRecentAttempt)
      : [];

    return progress;
  }

  function normalizeProgressCollection(collection) {
    if (!isRecord(collection)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(collection)
        .filter(([, stats]) => isRecord(stats))
        .map(([key, stats]) => [key, normalizeProgressStats(stats)]),
    );
  }

  function normalizeProgressStats(stats) {
    const normalized = createProgressStats();

    if (!isRecord(stats)) {
      return normalized;
    }

    ["label", "type", "mode", "lastAnsweredAt", "lastCorrectAt"].forEach((key) => {
      if (typeof stats[key] === "string") {
        normalized[key] = stats[key];
      }
    });
    normalized.attempts = asCount(stats.attempts);
    normalized.correct = Math.min(asCount(stats.correct), normalized.attempts);
    normalized.points = asCount(stats.points);
    normalized.currentStreak = asCount(stats.currentStreak);
    normalized.bestStreak = asCount(stats.bestStreak);
    normalized.bestScore = asCount(stats.bestScore);

    return normalized;
  }

  function normalizeRecentAttempt(attempt) {
    return {
      at: typeof attempt.at === "string" ? attempt.at : new Date().toISOString(),
      mode: typeof attempt.mode === "string" ? attempt.mode : GAME_MODES.MAP,
      modeLabel: typeof attempt.modeLabel === "string" ? attempt.modeLabel : "",
      type: typeof attempt.type === "string" ? attempt.type : "Question",
      questionId: typeof attempt.questionId === "string" ? attempt.questionId : "",
      questionLabel:
        typeof attempt.questionLabel === "string" ? attempt.questionLabel : "Question",
      prompt: typeof attempt.prompt === "string" ? attempt.prompt : "",
      answers: Array.isArray(attempt.answers)
        ? attempt.answers.filter((answer) => typeof answer === "string").slice(0, 24)
        : [],
      guessLabel: typeof attempt.guessLabel === "string" ? attempt.guessLabel : "",
      isCorrect: Boolean(attempt.isCorrect),
      earned: asCount(attempt.earned),
      score: asCount(attempt.score),
      streak: asCount(attempt.streak),
      distanceKm: Number.isFinite(attempt.distanceKm) ? attempt.distanceKm : null,
    };
  }

  function createEmptyProgress() {
    return {
      version: 1,
      totals: {
        attempts: 0,
        correct: 0,
        points: 0,
        bestStreak: 0,
        bestScore: 0,
      },
      modes: {},
      types: {},
      questions: {},
      days: {},
      recent: [],
    };
  }

  function createProgressStats(metadata = {}) {
    return {
      ...metadata,
      attempts: 0,
      correct: 0,
      points: 0,
      currentStreak: 0,
      bestStreak: 0,
    };
  }

  function getProgressStats(collection, key, metadata = {}) {
    if (!isRecord(collection[key])) {
      collection[key] = createProgressStats(metadata);
    }

    Object.assign(collection[key], metadata);
    collection[key].attempts = asCount(collection[key].attempts);
    collection[key].correct = asCount(collection[key].correct);
    collection[key].points = asCount(collection[key].points);
    collection[key].currentStreak = asCount(collection[key].currentStreak);
    collection[key].bestStreak = asCount(collection[key].bestStreak);

    return collection[key];
  }

  function incrementProgressStats(stats, isCorrect, points) {
    stats.attempts += 1;
    stats.correct += isCorrect ? 1 : 0;
    stats.points += points;
  }

  function getQuestionLabel(question) {
    const answerNames = question.answers.map(getRegionName);

    if (question.mode === GAME_MODES.OUTLINE || state.mode === GAME_MODES.OUTLINE) {
      return answerNames[0] || "Country outline";
    }

    if (question.type === "Flag") {
      return `Flag: ${answerNames[0] || question.clue}`;
    }

    return question.clue ? `${question.type}: ${question.clue}` : question.prompt;
  }

  function getRegionName(regionId) {
    return regionById.get(regionId)?.name || regionId;
  }

  function formatModeName(mode) {
    return mode === GAME_MODES.OUTLINE ? "Outlines" : "Map";
  }

  function formatAccuracy(stats) {
    return `${Math.round(getAccuracy(stats) * 100)}%`;
  }

  function formatRecentAccuracy(attempts) {
    const recent = attempts.slice(-RECENT_FORM_LIMIT);

    if (!recent.length) {
      return "0%";
    }

    const correct = recent.filter((attempt) => attempt.isCorrect).length;
    return `${Math.round((correct / recent.length) * 100)}%`;
  }

  function getAccuracy(stats) {
    const attempts = asCount(stats?.attempts);

    if (!attempts) {
      return 0;
    }

    return clamp(asCount(stats.correct) / attempts, 0, 1);
  }

  function compareLastAnswered(left, right) {
    return Date.parse(left.lastAnsweredAt || "") - Date.parse(right.lastAnsweredAt || "");
  }

  function formatAnswerNames(answers) {
    if (!answers.length) {
      return "Unknown";
    }

    if (answers.length <= 3) {
      return answers.join(", ");
    }

    return `${answers.slice(0, 3).join(", ")} +${answers.length - 3}`;
  }

  function formatInteger(value) {
    return asCount(value).toLocaleString();
  }

  function formatRelativeTime(value) {
    const timestamp = Date.parse(value);

    if (!Number.isFinite(timestamp)) {
      return "Unknown time";
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

    if (elapsedSeconds < 60) {
      return "Just now";
    }

    if (elapsedSeconds < 3600) {
      return `${Math.floor(elapsedSeconds / 60)}m ago`;
    }

    if (elapsedSeconds < 86400) {
      return `${Math.floor(elapsedSeconds / 3600)}h ago`;
    }

    if (elapsedSeconds < 604800) {
      return `${Math.floor(elapsedSeconds / 86400)}d ago`;
    }

    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function formatShortDate(date) {
    return date.toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    });
  }

  function formatLongDate(date) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function addDays(date, days) {
    const nextDate = new Date(date);
    nextDate.setHours(12, 0, 0, 0);
    nextDate.setDate(nextDate.getDate() + days);

    return nextDate;
  }

  function asCount(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return 0;
    }

    return Math.floor(number);
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function drawLand() {
    const fragment = document.createDocumentFragment();

    geography.landmasses.forEach((landmass) => {
      if (landmass.displayPath) {
        fragment.append(
          createSvgElement("path", {
            class: "land-fill",
            d: landmass.displayPath,
          }),
          createSvgElement("path", {
            class: "land-outline",
            d: landmass.displayPath,
          }),
        );
        return;
      }

      landmass.polygons.forEach((polygon) => {
        fragment.append(
          createSvgElement("path", {
            class: "land-fill",
            d: polygonToFillPath(polygon),
          }),
          createSvgElement("path", {
            class: "land-outline",
            d: polygonToOutlinePath(polygon),
          }),
        );
      });
    });

    elements.landLayer.replaceChildren(fragment);
  }

  function showAnswerZones(regionIds, className) {
    regionIds.forEach((regionId) => {
      const region = regionById.get(regionId);
      if (!region) {
        return;
      }

      if (region.displayPath) {
        elements.answerLayer.append(
          createSvgElement("path", {
            class: `answer-zone answer-fill ${className}`,
            d: region.displayPath,
          }),
          createSvgElement("path", {
            class: `answer-zone answer-outline ${className}`,
            d: region.displayPath,
          }),
        );
        return;
      }

      region.polygons.forEach((polygon) => {
        elements.answerLayer.append(
          createSvgElement("path", {
            class: `answer-zone answer-fill ${className}`,
            d: polygonToFillPath(polygon),
          }),
          createSvgElement("path", {
            class: `answer-zone answer-outline ${className}`,
            d: polygonToOutlinePath(polygon),
          }),
        );
      });
    });
  }

  function drawOutlineQuestion(question) {
    const region = regionById.get(question.regionId);
    if (!region) {
      return;
    }

    elements.outlineLayer.classList.remove("is-correct", "is-wrong");

    const shapeGroup = createSvgElement("g", { class: "country-outline-shape" });
    getRegionPathData(region).forEach((pathData) => {
      shapeGroup.append(
        createSvgElement("path", {
          class: "country-outline-fill",
          d: pathData,
        }),
        createSvgElement("path", {
          class: "country-outline-stroke",
          d: pathData,
        }),
      );
    });

    elements.outlineLayer.append(shapeGroup);
    const box = getMeasuredBox(shapeGroup) || getRegionProjectedBounds(region);
    const fitted = fitOutlineBox(box, question.outlineTransform);

    elements.outlineLayer.replaceChildren();
    shapeGroup.setAttribute(
      "transform",
      `translate(${-round(fitted.centerX)} ${-round(fitted.centerY)})`,
    );

    const outerGroup = createSvgElement("g", {
      transform: `translate(${OUTLINE_VIEW_WIDTH / 2} ${OUTLINE_VIEW_HEIGHT / 2})`,
    });
    const rotateGroup = createSvgElement("g", {
      transform: `rotate(${question.outlineTransform.angle})`,
    });
    const scaleGroup = createSvgElement("g", {
      transform: `scale(${round(fitted.scaleX)} ${round(fitted.scaleY)})`,
    });

    scaleGroup.append(shapeGroup);
    rotateGroup.append(scaleGroup);
    outerGroup.append(rotateGroup);
    elements.outlineLayer.append(outerGroup);
  }

  function getRegionPathData(region) {
    if (region.displayPath) {
      return [region.displayPath];
    }

    return region.polygons
      .map((polygon) => polygonToFillPath(polygon))
      .filter(Boolean);
  }

  function getMeasuredBox(element) {
    try {
      const box = element.getBBox();
      if (box.width > 0 && box.height > 0) {
        return box;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function fitOutlineBox(box, transform) {
    const width = Math.max(box.width, 1);
    const height = Math.max(box.height, 1);
    const radians = (transform.angle * Math.PI) / 180;
    const rotatedWidth =
      Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
    const rotatedHeight =
      Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
    const scale = Math.min(
      (OUTLINE_VIEW_WIDTH - OUTLINE_PADDING * 2) / Math.max(rotatedWidth, 1),
      (OUTLINE_VIEW_HEIGHT - OUTLINE_PADDING * 2) / Math.max(rotatedHeight, 1),
    );

    return {
      centerX: box.x + width / 2,
      centerY: box.y + height / 2,
      scaleX: transform.mirrorX ? -scale : scale,
      scaleY: transform.mirrorY ? -scale : scale,
    };
  }

  function addPin(point, isCorrect, replaceExisting = true) {
    const pin = createSvgElement("g", {
      class: "pin",
      transform: `translate(${point.x} ${point.y})`,
    });
    const shadowRadius = scaledLength(12);
    const dotRadius = scaledLength(5);

    pin.append(
      createSvgElement("circle", { cx: 0, cy: 0, r: shadowRadius }),
      createSvgElement("circle", {
        cx: 0,
        cy: 0,
        r: dotRadius,
        style: `fill: ${isCorrect ? "var(--good)" : "var(--bad)"}`,
      }),
    );

    if (replaceExisting) {
      elements.pinLayer.replaceChildren(pin);
    } else {
      elements.pinLayer.append(pin);
    }
  }

  function showMissDistance(clickPoint, answerIds) {
    const target = findNearestAnswerTarget(clickPoint, answerIds);

    if (!target) {
      return null;
    }

    const distanceKm = haversineDistanceKm(unproject(clickPoint), target.lonLat);
    const distanceText = formatDistanceKm(distanceKm);
    const labelPoint = getDistanceLabelPoint(clickPoint, target.point);
    const group = createSvgElement("g", { class: "answer-distance" });
    const label = createSvgElement("text", {
      class: "answer-distance-label",
      x: round(labelPoint.x),
      y: round(labelPoint.y),
      "font-size": round(scaledLength(15)),
      "text-anchor": "middle",
      "dominant-baseline": "central",
    });

    label.textContent = distanceText;
    group.append(
      createSvgElement("line", {
        class: "answer-distance-line",
        x1: round(clickPoint.x),
        y1: round(clickPoint.y),
        x2: round(target.point.x),
        y2: round(target.point.y),
      }),
      createSvgElement("circle", {
        class: "answer-distance-target",
        cx: round(target.point.x),
        cy: round(target.point.y),
        r: round(scaledLength(4.5)),
      }),
      label,
    );
    elements.answerLayer.append(group);

    return { distanceKm, distanceText, region: target.region };
  }

  function findNearestAnswerTarget(clickPoint, answerIds) {
    let bestTarget = null;

    answerIds.forEach((regionId) => {
      const region = regionById.get(regionId);

      if (!region) {
        return;
      }

      const target = getClosestPointOnRegion(clickPoint, region);
      if (target && (!bestTarget || target.mapDistance < bestTarget.mapDistance)) {
        bestTarget = { ...target, region };
      }
    });

    return bestTarget;
  }

  function getClosestPointOnRegion(point, region) {
    let closestTarget = null;

    region.polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        const target = getClosestPointOnRing(point, ring);
        if (target && (!closestTarget || target.mapDistance < closestTarget.mapDistance)) {
          closestTarget = target;
        }
      });
    });

    if (closestTarget) {
      return closestTarget;
    }

    const bounds = getRegionProjectedBounds(region);
    const fallbackPoint = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };

    return {
      point: fallbackPoint,
      lonLat: unproject(fallbackPoint),
      mapDistance: Math.hypot(point.x - fallbackPoint.x, point.y - fallbackPoint.y),
    };
  }

  function getClosestPointOnRing(point, ring) {
    let closestTarget = null;

    for (let index = 1; index < ring.length; index += 1) {
      const start = project(ring[index - 1]);
      const end = project(ring[index]);

      if (crossesMapEdge(start, end)) {
        continue;
      }

      const closestPoint = getClosestPointOnSegment(point, start, end);
      const mapDistance = Math.hypot(point.x - closestPoint.x, point.y - closestPoint.y);

      if (!closestTarget || mapDistance < closestTarget.mapDistance) {
        closestTarget = {
          point: closestPoint,
          lonLat: unproject(closestPoint),
          mapDistance,
        };
      }
    }

    return closestTarget;
  }

  function getDistanceLabelPoint(start, end) {
    const midpoint = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length === 0) {
      return midpoint;
    }

    const offset = scaledLength(14);

    return {
      x: midpoint.x - (dy / length) * offset,
      y: midpoint.y + (dx / length) * offset,
    };
  }

  function findRegions(lonLat) {
    return geography.regions.filter((region) =>
      region.polygons.some((polygon) => pointInPolygon(lonLat, polygon)),
    );
  }

  function getProjectedRegionArea(region) {
    return region.polygons.reduce((regionArea, polygon) => {
      const polygonArea = polygon.reduce((total, ring, index) => {
        const area = Math.abs(getProjectedRingArea(ring));
        return index === 0 ? total + area : total - area;
      }, 0);

      return regionArea + Math.max(polygonArea, 0);
    }, 0);
  }

  function getProjectedRingArea(ring) {
    let area = 0;

    for (let index = 0; index < ring.length; index += 1) {
      const current = project(ring[index]);
      const next = project(ring[(index + 1) % ring.length]);
      area += current.x * next.y - next.x * current.y;
    }

    return area / 2;
  }

  function getRegionProjectedBounds(region) {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };

    region.polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach((coordinate) => {
          const point = project(coordinate);
          bounds.minX = Math.min(bounds.minX, point.x);
          bounds.minY = Math.min(bounds.minY, point.y);
          bounds.maxX = Math.max(bounds.maxX, point.x);
          bounds.maxY = Math.max(bounds.maxY, point.y);
        });
      });
    });

    if (!Number.isFinite(bounds.minX)) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }

    return {
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    };
  }

  function describeClickedArea(lonLat, clickedRegion) {
    if (clickedRegion) {
      return clickedRegion.name;
    }

    const hitLand = geography.landmasses.some((landmass) =>
      landmass.polygons.some((polygon) => pointInPolygon(lonLat, polygon)),
    );

    return hitLand ? "unmapped land" : "the ocean";
  }

  function findNearbyAnswerRegion(point, answerIds) {
    const tolerance = ANSWER_SLOP_PX / getScreenToViewTransform().scale;
    let bestMatch = null;

    answerIds.forEach((regionId) => {
      const region = regionById.get(regionId);
      if (!region) {
        return;
      }

      const distance = distanceToRegion(point, region);
      if (distance <= tolerance && (!bestMatch || distance < bestMatch.distance)) {
        bestMatch = { region, distance };
      }
    });

    return bestMatch?.region || null;
  }

  function distanceToRegion(point, region) {
    let distance = Infinity;

    region.polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        distance = Math.min(distance, distanceToRing(point, ring));
      });
    });

    return distance;
  }

  function distanceToRing(point, ring) {
    let distance = Infinity;

    for (let index = 1; index < ring.length; index += 1) {
      const start = project(ring[index - 1]);
      const end = project(ring[index]);

      if (crossesMapEdge(start, end)) {
        continue;
      }

      distance = Math.min(distance, distanceToSegment(point, start, end));
    }

    return distance;
  }

  function distanceToSegment(point, start, end) {
    const closest = getClosestPointOnSegment(point, start, end);

    return Math.hypot(point.x - closest.x, point.y - closest.y);
  }

  function getClosestPointOnSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return { x: start.x, y: start.y };
    }

    const t = clamp(
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      0,
      1,
    );

    return {
      x: start.x + t * dx,
      y: start.y + t * dy,
    };
  }

  function buildGeography(gameData) {
    const decoder = createTopoJsonDecoder(gameData.topology);
    const countries = gameData.topology.objects.countries.geometries.map((geometry) => {
      const name = geometry.properties?.name || `Country ${geometry.id}`;
      const sourceId = geometry.id == null ? null : String(geometry.id);
      const id =
        gameData.countryIdOverrides?.[sourceId] ||
        gameData.countryNameOverrides?.[name] ||
        slugify(name);

      return {
        id,
        name,
        kind: "country",
        sourceId,
        displayPath: gameData.display?.countryPaths?.[id] || null,
        polygons: decoder.geometryToPolygons(geometry),
      };
    });
    const extraRegions = (gameData.extraRegions || []).map((region) => ({
      id: region.id,
      name: region.name,
      kind: region.kind,
      sourceId: region.sourceId,
      displayPath: gameData.display?.extraRegionPaths?.[region.id] || null,
      polygons: geoJsonGeometryToPolygons(region.geometry),
    }));
    const landmasses = [
      {
        id: "world-land",
        name: "World land",
        kind: "land",
        displayPath: gameData.display?.landPath || null,
        polygons: decoder.geometryToPolygons(gameData.topology.objects.land),
      },
    ];

    return {
      landmasses,
      regions: extraRegions.concat(countries),
    };
  }

  function createTopoJsonDecoder(topology) {
    const [scaleX, scaleY] = topology.transform.scale;
    const [translateX, translateY] = topology.transform.translate;
    const decodedArcs = topology.arcs.map((arc) => {
      let x = 0;
      let y = 0;

      return arc.map(([dx, dy]) => {
        x += dx;
        y += dy;
        return [x * scaleX + translateX, y * scaleY + translateY];
      });
    });

    function geometryToPolygons(geometry) {
      if (!geometry) {
        return [];
      }

      if (geometry.type === "GeometryCollection") {
        return geometry.geometries.flatMap(geometryToPolygons);
      }

      if (geometry.type === "Polygon") {
        return [geometry.arcs.map(ringToCoordinates).filter((ring) => ring.length >= 4)];
      }

      if (geometry.type === "MultiPolygon") {
        return geometry.arcs.map((polygon) =>
          polygon.map(ringToCoordinates).filter((ring) => ring.length >= 4),
        );
      }

      return [];
    }

    function ringToCoordinates(arcRefs) {
      const ring = [];

      arcRefs.forEach((arcRef, arcIndex) => {
        const arc = getArc(arcRef);

        arc.forEach((coordinate, coordinateIndex) => {
          if (arcIndex > 0 && coordinateIndex === 0) {
            return;
          }

          ring.push(coordinate);
        });
      });

      return closeRing(ring);
    }

    function getArc(arcRef) {
      const arc = decodedArcs[arcRef < 0 ? ~arcRef : arcRef];
      return arcRef < 0 ? arc.slice().reverse() : arc;
    }

    return { geometryToPolygons };
  }

  function geoJsonGeometryToPolygons(geometry) {
    if (geometry.type === "Polygon") {
      return [geometry.coordinates.map(normalizeRing).filter((ring) => ring.length >= 4)];
    }

    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.map((polygon) =>
        polygon.map(normalizeRing).filter((ring) => ring.length >= 4),
      );
    }

    return [];
  }

  function normalizeRing(ring) {
    return closeRing(ring.map(([longitude, latitude]) => [longitude, latitude]));
  }

  function closeRing(ring) {
    if (ring.length === 0) {
      return ring;
    }

    const first = ring[0];
    const last = ring[ring.length - 1];

    if (first[0] === last[0] && first[1] === last[1]) {
      return ring;
    }

    return ring.concat([[first[0], first[1]]]);
  }

  function pointInPolygon(point, polygon) {
    if (!polygon.length || !pointInRing(point, polygon[0])) {
      return false;
    }

    return !polygon.slice(1).some((ring) => pointInRing(point, ring));
  }

  function pointInRing(point, ring) {
    const [x, y] = point;
    let inside = false;

    for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index++) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[previousIndex];
      const crossesY = y1 > y !== y2 > y;

      if (!crossesY) {
        continue;
      }

      const xAtY = ((x2 - x1) * (y - y1)) / (y2 - y1) + x1;
      if (x < xAtY) {
        inside = !inside;
      }
    }

    return inside;
  }

  function polygonToFillPath(polygon) {
    return polygon
      .map((ring) => {
        return ring
          .map((coordinate, index) => {
            const point = project(coordinate);
            return `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`;
          })
          .join(" ")
          .concat(" Z");
      })
      .join(" ");
  }

  function polygonToOutlinePath(polygon) {
    return polygon
      .map((ring) => ringToOutlinePath(ring))
      .filter(Boolean)
      .join(" ");
  }

  function ringToOutlinePath(ring) {
    if (ring.length < 2) {
      return "";
    }

    const commands = [];
    let previous = null;

    ring.forEach((coordinate, index) => {
      const point = project(coordinate);
      const command =
        index === 0 || crossesMapEdge(previous, point)
          ? `M ${round(point.x)} ${round(point.y)}`
          : `L ${round(point.x)} ${round(point.y)}`;

      commands.push(command);
      previous = point;
    });

    return commands.join(" ");
  }

  function crossesMapEdge(previous, next) {
    return previous && Math.abs(next.x - previous.x) > MAP_WIDTH / 2;
  }

  function project([longitude, latitude]) {
    return {
      x: ((longitude + 180) / 360) * MAP_WIDTH,
      y: ((90 - latitude) / 180) * MAP_HEIGHT,
    };
  }

  function unproject(point) {
    return [
      (point.x / MAP_WIDTH) * 360 - 180,
      90 - (point.y / MAP_HEIGHT) * 180,
    ];
  }

  function getSvgPoint(event) {
    const transform = getScreenToViewTransform();

    return {
      x: state.view.x + (event.clientX - transform.left) / transform.scale,
      y: state.view.y + (event.clientY - transform.top) / transform.scale,
    };
  }

  function handlePointerDown(event) {
    elements.svg.setPointerCapture(event.pointerId);
    state.pointer = {
      id: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      moved: false,
    };
  }

  function handlePointerMove(event) {
    if (!state.pointer || state.pointer.id !== event.pointerId) {
      return;
    }

    const dx = event.clientX - state.pointer.lastClientX;
    const dy = event.clientY - state.pointer.lastClientY;
    const totalDistance = Math.hypot(
      event.clientX - state.pointer.startClientX,
      event.clientY - state.pointer.startClientY,
    );

    if (totalDistance > 4) {
      state.pointer.moved = true;
    }

    if (state.pointer.moved) {
      panByScreenDelta(dx, dy);
    }

    state.pointer.lastClientX = event.clientX;
    state.pointer.lastClientY = event.clientY;
  }

  function handlePointerUp(event) {
    if (!state.pointer || state.pointer.id !== event.pointerId) {
      return;
    }

    const wasClick = !state.pointer.moved;
    clearPointer();

    if (wasClick) {
      answerAt(getSvgPoint(event));
    }
  }

  function clearPointer() {
    state.pointer = null;
  }

  function handleWheel(event) {
    event.preventDefault();
    const point = getSvgPoint(event);
    zoomAround(point, event.deltaY < 0 ? 0.82 : 1.18);
  }

  function panByScreenDelta(dx, dy) {
    const transform = getScreenToViewTransform();

    setView({
      ...state.view,
      x: state.view.x - dx / transform.scale,
      y: state.view.y - dy / transform.scale,
    });
  }

  function getScreenToViewTransform() {
    const rect = elements.svg.getBoundingClientRect();
    const scale = Math.min(rect.width / state.view.width, rect.height / state.view.height);
    const renderedWidth = state.view.width * scale;
    const renderedHeight = state.view.height * scale;

    return {
      scale,
      left: rect.left + (rect.width - renderedWidth) / 2,
      top: rect.top + (rect.height - renderedHeight) / 2,
    };
  }

  function zoomAtCenter(factor) {
    zoomAround(
      {
        x: state.view.x + state.view.width / 2,
        y: state.view.y + state.view.height / 2,
      },
      factor,
    );
  }

  function zoomAround(anchor, factor) {
    const nextWidth = clamp(state.view.width * factor, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
    const nextHeight = nextWidth / 2;
    const ratioX = (anchor.x - state.view.x) / state.view.width;
    const ratioY = (anchor.y - state.view.y) / state.view.height;

    setView({
      x: anchor.x - nextWidth * ratioX,
      y: anchor.y - nextHeight * ratioY,
      width: nextWidth,
      height: nextHeight,
    });
  }

  function resetView() {
    setView({ x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT });
  }

  function setView(nextView) {
    const width = clamp(nextView.width, MIN_VIEW_WIDTH, MAX_VIEW_WIDTH);
    const height = width / 2;
    const x = clamp(nextView.x, 0, MAP_WIDTH - width);
    const y = clamp(nextView.y, 0, MAP_HEIGHT - height);

    state.view = { x, y, width, height };
    elements.svg.setAttribute(
      "viewBox",
      `${round(x)} ${round(y)} ${round(width)} ${round(height)}`,
    );
  }

  function updateStats() {
    elements.score.textContent = String(state.score);
    elements.streak.textContent = String(state.streak);
    elements.round.textContent = `${Math.min(state.currentIndex + 1, state.questions.length)}/${state.questions.length}`;
  }

  function getCurrentQuestion() {
    return state.questions[state.currentIndex];
  }

  function formatRegionList(regionIds) {
    const names = regionIds.map((id) => regionById.get(id)?.name || id);

    if (names.length <= 1) {
      return names[0] || "";
    }

    return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
  }

  function getFlagImageUrl(clue) {
    const codepoints = getFlagCodepoints(clue);
    return codepoints ? `${TWEMOJI_FLAG_BASE_URL}${codepoints}.svg` : "";
  }

  function getFlagCodepoints(clue) {
    if (typeof clue !== "string") {
      return "";
    }

    const characters = Array.from(clue.trim());
    if (
      characters.length !== 2 ||
      !characters.every((character) => isRegionalIndicator(character.codePointAt(0)))
    ) {
      return "";
    }

    return characters.map((character) => character.codePointAt(0).toString(16)).join("-");
  }

  function getFlagCountryCode(clue) {
    if (typeof clue !== "string") {
      return "";
    }

    const characters = Array.from(clue.trim());
    if (
      characters.length !== 2 ||
      !characters.every((character) => isRegionalIndicator(character.codePointAt(0)))
    ) {
      return "";
    }

    return characters
      .map((character) => String.fromCharCode(character.codePointAt(0) - 0x1f1e6 + 65))
      .join("");
  }

  function isRegionalIndicator(codepoint) {
    return codepoint >= 0x1f1e6 && codepoint <= 0x1f1ff;
  }

  function normalizeTypedAnswer(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\bsaint\b/g, "st")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/^the\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function haversineDistanceKm(startLonLat, endLonLat) {
    const [startLon, startLat] = startLonLat;
    const [endLon, endLat] = endLonLat;
    const startLatRad = toRadians(startLat);
    const endLatRad = toRadians(endLat);
    const deltaLat = toRadians(endLat - startLat);
    const deltaLon = toRadians(normalizeLongitudeDelta(endLon - startLon));
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(startLatRad) * Math.cos(endLatRad) * Math.sin(deltaLon / 2) ** 2;

    return (
      2 *
      EARTH_RADIUS_KM *
      Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
    );
  }

  function normalizeLongitudeDelta(delta) {
    return ((delta + 540) % 360) - 180;
  }

  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function formatDistanceKm(distanceKm) {
    if (distanceKm < 1) {
      return "<1 km";
    }

    return `${Math.round(distanceKm).toLocaleString()} km`;
  }

  function slugify(value) {
    return value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function createSvgElement(tagName, attributes) {
    const element = document.createElementNS(SVG_NS, tagName);

    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });

    return element;
  }

  function setHidden(element, hidden) {
    element.toggleAttribute("hidden", hidden);
  }

  function shuffle(items) {
    return items
      .map((item) => ({ item, sort: Math.random() }))
      .sort((left, right) => left.sort - right.sort)
      .map(({ item }) => item);
  }

  function scaledLength(length) {
    return (length * state.view.width) / MAP_WIDTH;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }
})();

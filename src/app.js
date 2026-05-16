(function () {
  "use strict";

  const MAP_WIDTH = 1000;
  const MAP_HEIGHT = 500;
  const MIN_VIEW_WIDTH = 90;
  const MAX_VIEW_WIDTH = MAP_WIDTH;
  const ANSWER_SLOP_PX = 18;
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
  };

  const state = {
    mode: GAME_MODES.MAP,
    questions: [],
    currentIndex: 0,
    score: 0,
    streak: 0,
    answered: false,
    view: { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT },
    pointer: null,
  };

  init();

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

    state.answered = false;
    elements.answerLayer.replaceChildren();
    elements.pinLayer.replaceChildren();
    elements.outlineLayer.replaceChildren();
    elements.outlineLayer.classList.remove("is-correct", "is-wrong");
    elements.nextButton.disabled = true;
    elements.nextButton.textContent = "Next";
    elements.feedback.className = "feedback";
    elements.feedback.textContent = "";
    elements.countryAnswer.value = "";
    elements.countryAnswer.disabled = !isOutlineMode;
    elements.submitAnswer.disabled = !isOutlineMode;

    elements.questionType.textContent = question.type;
    elements.questionPoints.textContent = `${question.points} pts`;
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
      elements.questionClue.textContent = question.clue;
      elements.questionClue.setAttribute("aria-label", question.clueLabel || question.clue);
      elements.questionClue.classList.toggle("is-text", !isFlagClue(question.clue));
    }

    updateStats();
  }

  function nextQuestion() {
    if (!state.answered) {
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

  function answerAt(point) {
    if (state.mode !== GAME_MODES.MAP || state.answered) {
      return;
    }

    const question = getCurrentQuestion();
    const lonLat = unproject(point);
    const clickedRegions = findRegions(lonLat);
    const forgivingAnswer = clickedRegions.length
      ? null
      : findNearbyAnswerRegion(point, question.answers);
    const correctRegion =
      clickedRegions.find((region) => question.answers.includes(region.id)) || forgivingAnswer;
    const clickedRegion = correctRegion || clickedRegions[0];
    const isCorrect = Boolean(correctRegion);

    state.answered = true;
    addPin(point, isCorrect);
    showAnswerZones(question.answers, "correct");

    if (clickedRegion && !isCorrect) {
      showAnswerZones([clickedRegion.id], "wrong");
    }

    if (isCorrect) {
      const earned = question.points + state.streak * 10;
      state.score += earned;
      state.streak += 1;
      elements.feedback.className = "feedback good";
      elements.feedback.textContent = `Correct: ${correctRegion.name}. +${earned} points.`;
    } else {
      const clicked = describeClickedArea(lonLat, clickedRegion);
      const answers = formatRegionList(question.answers);
      state.streak = 0;
      elements.feedback.className = "feedback bad";
      elements.feedback.textContent = `No: that was ${clicked}. Answer: ${answers}.`;
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

    state.answered = true;
    elements.countryAnswer.disabled = true;
    elements.submitAnswer.disabled = true;
    elements.outlineLayer.classList.toggle("is-correct", isCorrect);
    elements.outlineLayer.classList.toggle("is-wrong", !isCorrect);

    if (isCorrect) {
      const earned = question.points + state.streak * 10;
      state.score += earned;
      state.streak += 1;
      elements.feedback.className = "feedback good";
      elements.feedback.textContent = `Correct: ${region.name}. +${earned} points.`;
    } else {
      state.streak = 0;
      elements.feedback.className = "feedback bad";
      elements.feedback.textContent = `No: Answer: ${region.name}.`;
    }

    finishAnswer();
  }

  function finishAnswer() {
    elements.nextButton.disabled = false;
    elements.nextButton.textContent =
      state.currentIndex >= state.questions.length - 1 ? "Play again" : "Next";
    updateStats();
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

  function addPin(point, isCorrect) {
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

    elements.pinLayer.replaceChildren(pin);
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
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const t = clamp(
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      0,
      1,
    );
    const closest = {
      x: start.x + t * dx,
      y: start.y + t * dy,
    };

    return Math.hypot(point.x - closest.x, point.y - closest.y);
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

  function isFlagClue(clue) {
    return clue.length <= 8 && /\p{Regional_Indicator}/u.test(clue);
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

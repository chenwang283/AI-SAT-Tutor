const { createHash } = require("node:crypto");
const { isAllowedTag, getTagDefinition } = require("./reviewConfig");

function requestError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanString(value, label, maxLength = 2000) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  if (!cleaned)
    throw requestError(400, "INVALID_REVIEW", `${label} is required.`);
  if (cleaned.length > maxLength) {
    throw requestError(400, "INVALID_REVIEW", `${label} is too long.`);
  }
  return cleaned;
}

function normalizeSection(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z]+/g, " ")
    .trim();
  if (normalized === "math" || normalized === "sat math") return "math";
  if (
    normalized === "reading writing" ||
    normalized === "reading and writing" ||
    normalized === "sat reading writing" ||
    normalized === "sat reading and writing"
  ) {
    return "reading_writing";
  }
  throw requestError(
    400,
    "INVALID_REVIEW",
    "Section must be Math or Reading & Writing.",
  );
}

function normalizeDifficulty(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();
  const aliases = {
    e: "easy",
    easy: "easy",
    m: "medium",
    medium: "medium",
    h: "hard",
    hard: "hard",
  };
  const difficulty = aliases[normalized];
  if (!difficulty) {
    throw requestError(
      400,
      "INVALID_REVIEW",
      "Difficulty must be Easy, Medium, or Hard.",
    );
  }
  return difficulty;
}

function validateDateOnly(value, label = "Date") {
  const date = typeof value === "string" ? value.trim() : "";
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match)
    throw requestError(400, "INVALID_REVIEW", `${label} must use YYYY-MM-DD.`);
  const parsed = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() !== Number(match[2]) - 1 ||
    parsed.getUTCDate() !== Number(match[3])
  ) {
    throw requestError(
      400,
      "INVALID_REVIEW",
      `${label} is not a valid calendar date.`,
    );
  }
  return date;
}

function validateTimezone(value) {
  const timezone = cleanString(value, "Timezone", 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch (error) {
    throw requestError(
      400,
      "INVALID_REVIEW",
      "Timezone must be a valid IANA timezone.",
    );
  }
  return timezone;
}

function addCalendarDays(dateString, days) {
  const date = validateDateOnly(dateString);
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function cleanPageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.href;
  } catch (error) {
    return null;
  }
}

function getQuestionKey(question) {
  const questionId =
    typeof question?.questionId === "string" ? question.questionId.trim() : "";
  if (questionId) return `studyspaces:${questionId}`;
  const questionType =
    typeof question?.questionType === "string"
      ? question.questionType.trim()
      : "unknown";
  const stem =
    typeof question?.stem === "string"
      ? question.stem.replace(/\s+/g, " ").trim()
      : "";
  if (!stem)
    throw requestError(
      400,
      "INVALID_QUESTION",
      "Captured question must include a stem.",
    );
  const digest = createHash("sha256")
    .update(`${questionType}\n${stem}`)
    .digest("hex");
  return `content:${digest}`;
}

function deriveQuestionResult(question) {
  if (question?.questionType === "multiple_choice") {
    const selected =
      typeof question.selectedLetter === "string"
        ? question.selectedLetter.trim()
        : "";
    const correct =
      typeof question.correctLetter === "string"
        ? question.correctLetter.trim()
        : "";
    if (!selected || !correct) {
      throw requestError(
        400,
        "RESULT_NOT_AVAILABLE",
        "Reveal the selected and correct answers in StudySpaces before continuing.",
      );
    }
    return selected.toUpperCase() === correct.toUpperCase()
      ? "correct"
      : "wrong";
  }

  if (question?.questionType === "free_response") {
    if (typeof question.freeResponse?.isCorrect !== "boolean") {
      throw requestError(
        400,
        "RESULT_NOT_AVAILABLE",
        "Reveal the correct response in StudySpaces before continuing.",
      );
    }
    return question.freeResponse.isCorrect ? "correct" : "wrong";
  }

  throw requestError(
    400,
    "INVALID_QUESTION",
    "This question type is not supported.",
  );
}

function safeFigureSrc(value) {
  const url = cleanPageUrl(value);
  return url || null;
}

function sanitizeQuestionSnapshot(question) {
  return {
    questionId: question.questionId || null,
    phase: question.phase || null,
    questionType: question.questionType,
    stem: question.stem,
    figures: Array.isArray(question.figures)
      ? question.figures.map((figure) => ({
          src: safeFigureSrc(figure?.src),
          alt: typeof figure?.alt === "string" ? figure.alt : null,
          width: Number.isFinite(figure?.width) ? figure.width : null,
          height: Number.isFinite(figure?.height) ? figure.height : null,
          capturedImage: Boolean(
            figure?.dataUrl || figure?.src || figure?.capturedImage,
          ),
        }))
      : [],
    hasFigure: Boolean(question.hasFigure),
    options: Array.isArray(question.options)
      ? question.options.map((option) => ({
          letter: option?.letter || null,
          value: option?.value || null,
          selected: Boolean(option?.selected),
          reviewMarker: option?.reviewMarker || null,
        }))
      : null,
    selectedLetter: question.selectedLetter || null,
    correctLetter: question.correctLetter || null,
    freeResponse: question.freeResponse || null,
    tags: Array.isArray(question.tags) ? question.tags : null,
    explanation:
      typeof question.explanation === "string" ? question.explanation : null,
  };
}

function normalizeReviewInput(body, studentId) {
  const question = body?.question;
  if (
    !question ||
    typeof question !== "object" ||
    Array.isArray(question) ||
    !question.stem
  ) {
    throw requestError(
      400,
      "INVALID_QUESTION",
      "A captured StudySpaces question is required.",
    );
  }

  const metadata = body?.metadata || {};
  const diagnosis = body?.diagnosis || {};
  const section = normalizeSection(metadata.section);
  const tag = cleanString(diagnosis.tag, "Tag", 2).toUpperCase();
  if (!isAllowedTag(section, tag)) {
    throw requestError(
      400,
      "INVALID_REVIEW",
      "The selected tag does not match the question section.",
    );
  }

  const clockMode = String(diagnosis.clockMode || "")
    .toLowerCase()
    .trim();
  if (!["timed", "untimed"].includes(clockMode)) {
    throw requestError(
      400,
      "INVALID_REVIEW",
      "Clock must be Timed or Untimed.",
    );
  }

  const dateLogged = validateDateOnly(metadata.dateLogged, "Date");
  const result = deriveQuestionResult(question);

  return {
    student_id: studentId,
    question_key: getQuestionKey(question),
    studyspaces_question_id:
      typeof question.questionId === "string" && question.questionId.trim()
        ? question.questionId.trim()
        : null,
    page_url: cleanPageUrl(metadata.pageUrl),
    question_snapshot: sanitizeQuestionSnapshot(question),
    date_logged: dateLogged,
    timezone: validateTimezone(metadata.timezone),
    source: cleanString(metadata.source, "Source", 200),
    question_number: cleanString(
      metadata.questionNumber,
      "Question number",
      50,
    ),
    section,
    difficulty: normalizeDifficulty(metadata.difficulty),
    original_outcome: result === "correct" ? "correct_guess" : "incorrect",
    clock_mode: clockMode,
    where_wrong: cleanString(
      diagnosis.whereWrong,
      "Where you went wrong",
      4000,
    ),
    prevention_rule: cleanString(diagnosis.myRule, "Your rule", 4000),
    mistake_tag: tag,
    redo_3_due_on: addCalendarDays(dateLogged, 3),
    redo_14_due_on: addCalendarDays(dateLogged, 14),
  };
}

function normalizeReviewUpdate(body, currentRow) {
  const diagnosis = body?.diagnosis;
  if (!diagnosis || typeof diagnosis !== "object" || Array.isArray(diagnosis)) {
    throw requestError(
      400,
      "INVALID_REVIEW",
      "Updated diagnosis, rule, and tag are required.",
    );
  }

  const tag = cleanString(diagnosis.tag, "Tag", 2).toUpperCase();
  if (!isAllowedTag(currentRow.section, tag)) {
    throw requestError(
      400,
      "INVALID_REVIEW",
      "The selected tag does not match the question section.",
    );
  }

  return {
    where_wrong: cleanString(
      diagnosis.whereWrong,
      "Where you went wrong",
      4000,
    ),
    prevention_rule: cleanString(diagnosis.myRule, "Your rule", 4000),
    mistake_tag: tag,
  };
}

function serializeReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    questionKey: row.question_key,
    studyspacesQuestionId: row.studyspaces_question_id,
    pageUrl: row.page_url,
    question: row.question_snapshot,
    dateLogged: row.date_logged,
    timezone: row.timezone,
    source: row.source,
    questionNumber: row.question_number,
    section: row.section,
    difficulty: row.difficulty,
    originalOutcome: row.original_outcome,
    clockMode: row.clock_mode,
    whereWrong: row.where_wrong,
    myRule: row.prevention_rule,
    tag: row.mistake_tag,
    tagDefinition:
      getTagDefinition(row.section, row.mistake_tag)?.description || null,
    redo3: {
      dueOn: row.redo_3_due_on,
      result: row.redo_3_result,
      completedAt: row.redo_3_completed_at,
    },
    redo14: {
      dueOn: row.redo_14_due_on,
      result: row.redo_14_result,
      completedAt: row.redo_14_completed_at,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function databaseError(error, fallbackMessage) {
  if (error?.code === "23505") {
    return requestError(
      409,
      "DUPLICATE_REVIEW",
      "This question already has a review logged for this date.",
    );
  }
  return requestError(502, "DATABASE_ERROR", error?.message || fallbackMessage);
}

async function createReview(supabase, studentId, body) {
  const row = normalizeReviewInput(body, studentId);
  const { data, error } = await supabase
    .from("question_reviews")
    .insert(row)
    .select("*")
    .single();
  if (error) throw databaseError(error, "Unable to save the question review.");
  return serializeReview(data);
}

async function getOwnedReview(supabase, id) {
  const { data, error } = await supabase
    .from("question_reviews")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw databaseError(error, "Unable to load the question review.");
  if (!data)
    throw requestError(404, "REVIEW_NOT_FOUND", "Question review not found.");
  return data;
}

async function updateReview(supabase, id, body) {
  const currentRow = await getOwnedReview(supabase, id);
  const update = normalizeReviewUpdate(body, currentRow);
  const { data, error } = await supabase
    .from("question_reviews")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error)
    throw databaseError(error, "Unable to update the question review.");
  return serializeReview(data);
}

function deriveDueItem(row, today) {
  if (!row.redo_3_result && row.redo_3_due_on <= today) {
    return { stage: 3, dueOn: row.redo_3_due_on };
  }
  if (row.redo_3_result && !row.redo_14_result && row.redo_14_due_on <= today) {
    return { stage: 14, dueOn: row.redo_14_due_on };
  }
  return null;
}

function buildDueSummary(rows, today) {
  const items = rows
    .map((row) => {
      const due = deriveDueItem(row, today);
      if (!due) return null;
      return {
        reviewId: row.id,
        stage: due.stage,
        dueOn: due.dueOn,
        overdue: due.dueOn < today,
        source: row.source,
        questionNumber: row.question_number,
        section: row.section,
        pageUrl: row.page_url,
        questionKey: row.question_key,
        stem: row.question_snapshot?.stem || "",
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.dueOn.localeCompare(b.dueOn) || a.source.localeCompare(b.source),
    );

  return {
    count: items.length,
    overdueCount: items.filter((item) => item.overdue).length,
    dueTodayCount: items.filter((item) => !item.overdue).length,
    items,
  };
}

async function getDueReviews(supabase, todayValue) {
  const today = validateDateOnly(todayValue, "Today");
  const { data, error } = await supabase
    .from("question_reviews")
    .select("*")
    .or("redo_3_result.is.null,redo_14_result.is.null");
  if (error) throw databaseError(error, "Unable to load due reviews.");
  return buildDueSummary(data || [], today);
}

async function completeRedo(supabase, id, stageValue, body) {
  const stage = Number(stageValue);
  if (![3, 14].includes(stage)) {
    throw requestError(
      400,
      "INVALID_REDO_STAGE",
      "Redo stage must be 3 or 14.",
    );
  }

  const today = validateDateOnly(body?.today, "Today");
  const question = body?.question;
  const row = await getOwnedReview(supabase, id);
  if (getQuestionKey(question) !== row.question_key) {
    throw requestError(
      409,
      "QUESTION_MISMATCH",
      "Open the saved StudySpaces question before completing this redo.",
    );
  }

  if (stage === 14 && !row.redo_3_result) {
    throw requestError(409, "REDO_ORDER", "Complete the +3 day redo first.");
  }

  const resultField = stage === 3 ? "redo_3_result" : "redo_14_result";
  const completedField =
    stage === 3 ? "redo_3_completed_at" : "redo_14_completed_at";
  const dueField = stage === 3 ? "redo_3_due_on" : "redo_14_due_on";
  if (row[resultField])
    throw requestError(409, "REDO_COMPLETE", "This redo is already complete.");
  if (today < row[dueField])
    throw requestError(409, "REDO_NOT_DUE", "This redo is not due yet.");

  const result = deriveQuestionResult(question);
  const { data, error } = await supabase
    .from("question_reviews")
    .update({
      [resultField]: result,
      [completedField]: new Date().toISOString(),
    })
    .eq("id", id)
    .is(resultField, null)
    .select("*")
    .maybeSingle();
  if (error) throw databaseError(error, "Unable to complete the redo.");
  if (!data)
    throw requestError(409, "REDO_COMPLETE", "This redo is already complete.");

  return { result, review: serializeReview(data) };
}

module.exports = {
  requestError,
  normalizeSection,
  normalizeDifficulty,
  validateDateOnly,
  validateTimezone,
  addCalendarDays,
  getQuestionKey,
  deriveQuestionResult,
  sanitizeQuestionSnapshot,
  normalizeReviewInput,
  normalizeReviewUpdate,
  serializeReview,
  createReview,
  getOwnedReview,
  updateReview,
  getDueReviews,
  buildDueSummary,
  completeRedo,
};

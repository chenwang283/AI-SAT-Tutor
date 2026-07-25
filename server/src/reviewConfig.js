const CLOCK_OPTIONS = [
  { value: "untimed", label: "Untimed" },
  { value: "timed", label: "Timed" },
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const SECTION_OPTIONS = [
  { value: "math", label: "Math" },
  { value: "reading_writing", label: "Reading & Writing" },
];

const SHARED_VOCAB_TAG = { value: "V", label: "V" };

const TAGS_BY_SECTION = {
  math: [
    {
      ...SHARED_VOCAB_TAG,
      description:
        "Not knowing enough vocabulary to understand the question, math terms, or provided information.",
    },
    {
      value: "1",
      label: "1",
      description:
        "Did not understand the question, provided information, data, answer choices, or final target.",
    },
    {
      value: "2",
      label: "2",
      description:
        "Understood the task and materials but lacked a needed concept, rule, or task skill, including brute forcing.",
    },
    { value: "3", label: "3", description: "Could not figure out the first or next step." },
    {
      value: "4",
      label: "4",
      description:
        "Knew the needed ideas but did not choose the fastest, simplest, lowest-risk method.",
    },
    {
      value: "5",
      label: "5",
      description: "Used the right method but made a slip while carrying it out.",
    },
  ],
  reading_writing: [
    {
      ...SHARED_VOCAB_TAG,
      description: "Not knowing enough vocabulary to understand the passage.",
    },
    {
      value: "A",
      label: "A",
      description:
        "Did not understand the question, provided information, passage or sentence details, data, answer choices, or final target.",
    },
    {
      value: "B",
      label: "B",
      description:
        "Understood the task and materials but lacked a needed concept, rule, or task skill, including brute forcing.",
    },
    {
      value: "C",
      label: "C",
      description: "The chosen answer does not actually answer the question.",
    },
    {
      value: "D",
      label: "D",
      description: "The chosen answer is not fully supported by the text.",
    },
    { value: "E", label: "E", description: "Both C and D." },
  ],
};

const REVIEW_CONFIG = {
  clockOptions: CLOCK_OPTIONS,
  difficultyOptions: DIFFICULTY_OPTIONS,
  sectionOptions: SECTION_OPTIONS,
  tagsBySection: TAGS_BY_SECTION,
};

function getTagDefinition(section, tag) {
  return TAGS_BY_SECTION[section]?.find((option) => option.value === tag) || null;
}

function isAllowedTag(section, tag) {
  return Boolean(getTagDefinition(section, tag));
}

module.exports = {
  CLOCK_OPTIONS,
  DIFFICULTY_OPTIONS,
  SECTION_OPTIONS,
  TAGS_BY_SECTION,
  REVIEW_CONFIG,
  getTagDefinition,
  isAllowedTag,
};

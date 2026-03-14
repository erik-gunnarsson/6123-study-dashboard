export async function loadCatalog() {
  const response = await fetch("./data/question-catalog.json");

  if (!response.ok) {
    throw new Error("Could not load the question catalog.");
  }

  return response.json();
}

export function buildSectionOptions(catalog) {
  return [
    { value: "all", label: "All sections" },
    ...catalog.sections.map((section) => ({
      value: section.id,
      label: `${section.label}`,
    })),
  ];
}

export function getQuestionById(catalog, questionId) {
  return catalog.questions.find((question) => question.id === questionId) ?? null;
}

type RequiredDocuments = {
  application: unknown | null;
  frontLabel: unknown | null;
  backLabel: unknown | null;
};

export function countRequiredDocuments(documents: RequiredDocuments): number {
  return (
    Number(documents.application !== null) +
    Number(documents.frontLabel !== null) +
    Number(documents.backLabel !== null)
  );
}

export function isSubmissionComplete(documents: RequiredDocuments): boolean {
  return countRequiredDocuments(documents) === 3;
}

export interface Worker {
  id: number;
  harvestYearId: number;
  name: string;
  surname: string;
  phoneNumber: string;
  isArchived: boolean;
}

export interface CreateWorkerInput {
  harvestYearId: number;
  name: string;
  surname: string;
  phoneNumber?: string;
}

function normalizeLabel(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }

  return trimmed
    .split(/\s+/)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

export function normalizeWorkerInput(input: CreateWorkerInput): Omit<Worker, 'id'> {
  const name = normalizeLabel(input.name);
  const surname = normalizeLabel(input.surname);
  const phoneNumber = (input.phoneNumber ?? '').trim();

  if (!name) {
    throw new Error('Nome obbligatorio.');
  }
  if (!surname) {
    throw new Error('Cognome obbligatorio.');
  }

  return {
    harvestYearId: Math.trunc(input.harvestYearId),
    name,
    surname,
    phoneNumber,
    isArchived: false,
  };
}

export function sortWorkers(workers: Worker[]): Worker[] {
  return [...workers].sort((a, b) => {
    if (a.surname !== b.surname) {
      return a.surname.localeCompare(b.surname, 'it');
    }
    return a.name.localeCompare(b.name, 'it');
  });
}

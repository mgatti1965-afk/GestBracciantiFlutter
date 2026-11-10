export interface HarvestYear {
  id: number;
  isCurrent: boolean;
  notes: string;
}

export interface CreateHarvestYearInput {
  id: number;
  notes?: string;
}

export function normalizeYearInput(input: CreateHarvestYearInput): HarvestYear {
  const id = Math.trunc(input.id);
  if (id < 2000 || id > 2100) {
    throw new Error('Anno non valido. Usa un valore tra 2000 e 2100.');
  }

  return {
    id,
    isCurrent: false,
    notes: (input.notes ?? '').trim(),
  };
}

export function sortYearsDesc(years: HarvestYear[]): HarvestYear[] {
  return [...years].sort((a, b) => b.id - a.id);
}

export function ensureSingleCurrent(years: HarvestYear[], currentId: number): HarvestYear[] {
  return years.map((y) => ({ ...y, isCurrent: y.id === currentId }));
}

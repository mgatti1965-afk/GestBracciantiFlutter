export interface CompensationInput {
  totalHours: number;
  extraThreshold: number;
  isHoliday: boolean;
  hourlyRate: number;
  extraHourlyRate: number;
  holidayHourlyRate: number;
}

export interface CompensationOutput {
  ordinaryHours: number;
  extraHours: number;
  holidayHours: number;
  ordinaryAmount: number;
  extraAmount: number;
  holidayAmount: number;
  totalAmount: number;
}

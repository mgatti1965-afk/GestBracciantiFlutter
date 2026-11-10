# Regole Business Canoniche

Versione: 0.1

## R1 - Soglia straordinari

- Input: totalHours, extraThreshold.
- Se il giorno non e festivo:
  - ordinaryHours = min(totalHours, extraThreshold)
  - extraHours = max(totalHours - extraThreshold, 0)
  - holidayHours = 0

## R2 - Giorno festivo

- Se il giorno e festivo (automatico o manuale):
  - holidayHours = totalHours
  - ordinaryHours = 0
  - extraHours = 0

## R3 - Compensi

- ordinaryAmount = ordinaryHours * hourlyRate
- extraAmount = extraHours * extraHourlyRate
- holidayAmount = holidayHours * holidayHourlyRate
- totalAmount = ordinaryAmount + extraAmount + holidayAmount

## R4 - Calendario festivi

- Configurazione settimanale:
  - 0 nessuno
  - 1 sabato
  - 2 domenica
  - 3 sabato e domenica
- Il toggle manuale per giorno prevale sul calendario automatico.
- La lista date festive globali va considerata come festiva.

## R5 - Integrita annata corrente

- Una sola annata puo essere marcata isCurrent = true.

## R6 - Merge braccianti

- Trasferire log e appartenenze gruppo dal source al target.
- Evitare duplicati di membership e configurazioni annuali.
- Eliminare il source solo a trasferimenti completati.

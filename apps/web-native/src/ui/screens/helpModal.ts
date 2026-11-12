import { openModal } from '../utils';

export type HelpTopic =
  | 'year_selection'
  | 'daily_logging'
  | 'work_day_detail'
  | 'worker_registry'
  | 'financial_summary'
  | 'others'
  | 'modifica_orari';

const TOPIC_HELP: Record<HelpTopic, { title: string; points: string[] }> = {
  year_selection: {
    title: 'Guida — Selezione Annata',
    points: [
      'Seleziona un\'annata esistente per aprire il registro delle presenze.',
      'Con "+ Nuova Annata" puoi creare un nuovo anno importando automaticamente braccianti (con relative tariffe) e gruppi dall\'ultima annata.',
      'Se hai un backup CSV esportato da Android o dal Web, puoi importarlo subito da qui oppure dalla scheda Varie.',
    ],
  },
  daily_logging: {
    title: 'Guida — Gestione Ore (Calendario)',
    points: [
      'Il calendario mostra la settimana corrente o l\'intero mese (usa "Espandi mese" / "Riduci a settimana").',
      'Ogni cella evidenzia le ore totali lavorate (verde) o le giornate festive (rosso vino).',
      'Clicca su un giorno per aprire il Dettaglio Giornata e inserire o modificare braccianti e gruppi.',
      'Con il tasto "Festivo" su una giornata (o nel dettaglio) puoi forzare/rimuovere una festività locale (es. patrono) ricalcolando i compensi.',
    ],
  },
  work_day_detail: {
    title: 'Guida — Dettaglio Giornata',
    points: [
      'Usa "+ Gruppi" per inserire un\'intera squadra con gli stessi orari in un clic, oppure "+ Bracciante" per aggiungere un singolo lavoratore.',
      'Clicca su una card bracciante per modificare gli orari di mattina e pomeriggio.',
      'Il pulsante "Festivo" sulla singola card forza la festività individuale per quel bracciante in quella data.',
    ],
  },
  modifica_orari: {
    title: 'Guida — Inserimento Orari e Periodo',
    points: [
      'Usa i pulsanti -15\' / +15\' oppure scrivi direttamente l\'orario in formato HH:mm (es. 08:00).',
      'Le ore ordinarie, straordinarie (oltre la soglia configurata in Varie) e festive vengono calcolate automaticamente.',
      'Attiva "Espandi a più giorni" per replicare gli stessi orari su più giornate consecutive (con avviso di sovrascrittura).',
    ],
  },
  worker_registry: {
    title: 'Guida — Registro Braccianti e Gruppi',
    points: [
      'In "Anagrafica" gestisci i braccianti e le tre tariffe per l\'annata corrente (Normale, Straordinario, Festivo).',
      'Modificando la paga normale, straordinario e festivo si allineano automaticamente finché non li personalizzi.',
      'Se importando un backup ci sono profili duplicati, appare l\'avviso "Unisci Profili" in cima alla lista.',
      'Nella scheda "Gruppi" crei le squadre e assegni i componenti; all\'inizio di una nuova annata puoi copiare tutto dall\'anno precedente.',
    ],
  },
  financial_summary: {
    title: 'Guida — Riepilogo e Report PDF',
    points: [
      'Filtra per Anno, Mese, Settimana o Giorno e naviga tra i periodi con le frecce < >.',
      'Alterna tra vista per Braccianti (Dettaglio o Totali) e vista per Gruppi.',
      'Usa "Genera Report PDF / Stampa" per stampare o salvare in PDF il prospetto completo con dettaglio Ordinarie, Straordinarie e Festive.',
    ],
  },
  others: {
    title: 'Guida — Varie, Impostazioni e Backup',
    points: [
      'Inserisci Cognome e Nome Titolare/Azienda per vederli nell\'intestazione dei report stampati.',
      'Imposta la soglia ore oltre la quale scatta lo straordinario (predefinita: 8 ore) e i giorni festivi settimanali (Sabato / Domenica).',
      'I backup CSV usano il formato standard GestBraccianti_Bkp_YYYYMMDD_HHmm.csv, 100% compatibile con l\'app Android.',
    ],
  },
};

export function showHelpDialog(topic: HelpTopic): void {
  const info = TOPIC_HELP[topic];
  const modal = openModal({ title: info.title });

  const ul = document.createElement('ul');
  ul.className = 'help-list';
  for (const point of info.points) {
    const li = document.createElement('li');
    li.textContent = point;
    ul.appendChild(li);
  }
  modal.body.appendChild(ul);

  const note = document.createElement('p');
  note.className = 'muted small-note';
  note.textContent =
    'I dati sono salvati localmente nel tuo browser (IndexedDB). Ricorda di esportare periodicamente un backup CSV dalla scheda Varie.';
  modal.body.appendChild(note);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-primary';
  closeBtn.textContent = 'Ho capito';
  closeBtn.addEventListener('click', () => modal.close());
  modal.footer.appendChild(closeBtn);
}

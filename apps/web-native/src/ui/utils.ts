const ITALIAN_LOCALE = 'it-IT';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function capitalizeFirst(value: string): string {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatMonthYear(millis: number): string {
  const formatted = new Date(millis).toLocaleDateString(ITALIAN_LOCALE, {
    month: 'long',
    year: 'numeric',
  });
  return capitalizeFirst(formatted);
}

export function formatFullDate(millis: number): string {
  const formatted = new Date(millis).toLocaleDateString(ITALIAN_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return capitalizeFirst(formatted);
}

export function formatShortDayDate(millis: number): string {
  const formatted = new Date(millis).toLocaleDateString(ITALIAN_LOCALE, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return capitalizeFirst(formatted);
}

export function formatDayName(millis: number): string {
  const formatted = new Date(millis).toLocaleDateString(ITALIAN_LOCALE, {
    weekday: 'long',
  });
  return capitalizeFirst(formatted);
}

export function formatDayMonth(millis: number): string {
  const d = new Date(millis);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function formatDayMonthShort(millis: number): string {
  return new Date(millis).toLocaleDateString(ITALIAN_LOCALE, {
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateTime(millis: number): string {
  return new Date(millis).toLocaleString(ITALIAN_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ToastController {
  show(message: string, isError?: boolean): void;
}

export function createToastController(host: HTMLElement): ToastController {
  let timer: number | undefined;

  return {
    show(message: string, isError = false): void {
      host.innerHTML = '';
      const bar = document.createElement('div');
      bar.className = isError ? 'toast toast-error' : 'toast toast-info';
      bar.setAttribute('role', 'status');

      const span = document.createElement('span');
      span.textContent = message;

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'toast-close';
      closeBtn.setAttribute('aria-label', 'Chiudi messaggio');
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => {
        host.innerHTML = '';
      });

      bar.append(span, closeBtn);
      host.appendChild(bar);

      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        host.innerHTML = '';
      }, isError ? 5500 : 3500);
    },
  };
}

export interface ModalHandle {
  overlay: HTMLDivElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
  close(): void;
}

export function openModal(params: {
  title: string;
  headerActionHtml?: string;
  onHeaderAction?: (btn: HTMLButtonElement) => void;
  onClose?: () => void;
}): ModalHandle {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = 'modal-card';

  const header = document.createElement('div');
  header.className = 'modal-header';

  const h3 = document.createElement('h3');
  h3.textContent = params.title;
  header.appendChild(h3);

  if (params.headerActionHtml) {
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'modal-header-actions';
    actionsWrap.innerHTML = params.headerActionHtml;
    const actionBtn = actionsWrap.querySelector<HTMLButtonElement>('button');
    if (actionBtn && params.onHeaderAction) {
      actionBtn.addEventListener('click', () => params.onHeaderAction?.(actionBtn));
    }
    header.appendChild(actionsWrap);
  }

  const body = document.createElement('div');
  body.className = 'modal-body';

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  card.append(header, body, footer);
  overlay.appendChild(card);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close();
    }
  };

  const close = () => {
    window.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    params.onClose?.();
  };

  window.addEventListener('keydown', onKeyDown);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  document.body.appendChild(overlay);
  return { overlay, body, footer, close };
}

export function showConfirmDialog(params: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}): void {
  const modal = openModal({ title: params.title });
  const p = document.createElement('p');
  p.className = 'modal-text';
  p.textContent = params.message;
  modal.body.appendChild(p);

  if (params.cancelLabel !== '') {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = params.cancelLabel ?? 'Annulla';
    cancelBtn.addEventListener('click', () => modal.close());
    modal.footer.appendChild(cancelBtn);
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = params.danger ? 'btn btn-danger' : 'btn btn-primary';
  confirmBtn.textContent = params.confirmLabel ?? 'Conferma';
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    try {
      await params.onConfirm();
      modal.close();
    } finally {
      confirmBtn.disabled = false;
    }
  });

  modal.footer.appendChild(confirmBtn);
}

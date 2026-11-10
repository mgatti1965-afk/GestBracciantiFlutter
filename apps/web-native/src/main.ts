import { renderApp } from './App';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Nodo root non trovato');
}

root.innerHTML = '';
root.textContent = 'Caricamento...';

renderApp()
  .then((app) => {
    root.innerHTML = '';
    root.appendChild(app);
  })
  .catch((error: unknown) => {
    root.innerHTML = '<p>Errore avvio applicazione web-native.</p>';
    console.error(error);
  });

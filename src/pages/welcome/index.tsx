import { createRoot } from 'react-dom/client';

import '@pages/welcome/index.css';

import '@assets/styles/tailwind.css';

import { LanguageProvider } from '../../contexts/LanguageContext';
import { Welcome } from './Welcome';

function init() {
  const rootContainer = document.querySelector('#__root');
  if (!rootContainer) throw new Error("Can't find Welcome root element");
  createRoot(rootContainer).render(
    <LanguageProvider>
      <Welcome />
    </LanguageProvider>,
  );
}

init();

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import i18n from './i18n'
import App from './App.tsx'
import { syncDocumentLanguage } from './lib/seo'

syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language)
i18n.off('languageChanged', syncDocumentLanguage)
i18n.on('languageChanged', syncDocumentLanguage)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

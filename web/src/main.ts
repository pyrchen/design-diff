import { createApp } from 'vue';
import App from './App.vue';

// Local, self-hosted fonts via @fontsource — no Google Fonts CDN, no
// network font requests. Fira Code carries headings/wordmark/all metrics
// (px, %, hex, selectors, breakpoints, the Claude prompt); Fira Sans is the
// body/UI face.
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';
import '@fontsource/fira-code/600.css';
import '@fontsource/fira-code/700.css';
import '@fontsource/fira-sans/300.css';
import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-sans/700.css';

import './style.css';

createApp(App).mount('#app');

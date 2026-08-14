import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import './index.css';
import App from './App.tsx';

// Initialize Google Maps Places globally
setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  v: 'weekly',
});

importLibrary('places')
  .then(() => {
    console.log('Google Maps Places API initialized successfully!');
  })
  .catch((err) => {
    console.error('⚠️ Google Maps failed to load:', err);
  });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.tsx'

// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )

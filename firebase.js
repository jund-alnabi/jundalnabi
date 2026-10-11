import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-analytics.js';
import { app } from './firebase-client.js';

isSupported()
  .then((supported) => {
    if (supported) {
      getAnalytics(app);
    }
  })
  .catch((error) => {
    console.error('Firebase Analytics could not be initialized.', error);
  });

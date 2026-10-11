import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAfeAtJ2dl2njkFs_zsTkhQ9aiHch0cla4',
  authDomain: 'jundalnabi-9b088.firebaseapp.com',
  databaseURL: 'https://jundalnabi-9b088-default-rtdb.firebaseio.com',
  projectId: 'jundalnabi-9b088',
  storageBucket: 'jundalnabi-9b088.firebasestorage.app',
  messagingSenderId: '533569520174',
  appId: '1:533569520174:web:d9ac194eade4cbddd3d5bf',
  measurementId: 'G-WJ0WY5VXGX'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

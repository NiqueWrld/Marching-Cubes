import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    apiKey:            'AIzaSyDa28qQZ2bAdGN8lq9AtA8BQB3q9gwN8z0',
    authDomain:        'shaka-zulu-581b6.firebaseapp.com',
    databaseURL:       'https://shaka-zulu-581b6-default-rtdb.firebaseio.com',
    projectId:         'shaka-zulu-581b6',
    storageBucket:     'shaka-zulu-581b6.appspot.com',
    messagingSenderId: '316811432200',
    appId:             '1:316811432200:web:47f115f6b6e163ba8f9cbd',
};

export const app      = initializeApp(firebaseConfig);
export const auth     = getAuth(app);
export const provider = new GoogleAuthProvider();
export const database = getDatabase(app);

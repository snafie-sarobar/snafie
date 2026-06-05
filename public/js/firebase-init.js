const firebaseConfig = {
  apiKey: "AIzaSyA2wJMdFBdomcKYcsWFFWdsBIKAnhcdAHE",
  authDomain: "snafie-official.firebaseapp.com",
  projectId: "snafie-official",
  storageBucket: "snafie-official.firebasestorage.app",
  messagingSenderId: "1088596048077",
  appId: "1:1088596048077:web:bb3459a2a70f3ac864d184",
  measurementId: "G-CTX1QG92RC"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

auth.useDeviceLanguage();

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD0T-Y-5VbKonnt_MpAhGjF42o_3sjMFew",
  authDomain: "ram-green-erp.firebaseapp.com",
  projectId: "ram-green-erp",
  storageBucket: "ram-green-erp.firebasestorage.app",
  messagingSenderId: "977277723636",
  appId: "1:977277723636:web:4126bfde67cdbae126cfa1",
};

export const LOCAL = false;
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

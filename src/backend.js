import * as FA from "firebase/auth";
import * as FS from "firebase/firestore";
import * as L from "./local";
import { auth, db, LOCAL } from "./firebase";

const A = LOCAL ? L : FA;
const S = LOCAL ? L : FS;
export { auth, db, LOCAL };
export const { onAuthStateChanged, signInWithEmailAndPassword, signOut } = A;
export const { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } = S;

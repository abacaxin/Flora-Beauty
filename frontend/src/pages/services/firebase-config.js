// ── Configuração central do Firebase ──────────────────────────────────────
// Importado como módulo ES (via CDN) em todas as páginas que precisam de
// Auth e/ou Firestore. Mantém UMA única inicialização do app.
//
// ⚠️ Projeto atual: "flora-5754a" — usado como AMBIENTE DE TESTES.
// Quando quiser voltar pro projeto de produção ("florabeauty") ou apontar
// para outro projeto, basta trocar os valores abaixo.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  getAuth,
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyACUAYAfglk9tMu3RpbBbEgQSjTC8eLXYU",
  authDomain: "flora-5754a.firebaseapp.com",
  projectId: "flora-5754a",
  storageBucket: "flora-5754a.firebasestorage.app",
  messagingSenderId: "819737384786",
  appId: "1:819737384786:web:0e7152e6065e13c9c58c8b",
  measurementId: "G-CYJD1Y9V2H"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Para testar localmente com os emuladores do Firebase, descomente:
// connectFirestoreEmulator(db, "localhost", 8080);
// connectAuthEmulator(auth, "http://localhost:9099");


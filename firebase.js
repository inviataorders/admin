import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, onSnapshot, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyA2O7K4B0v8A5xtiuKyMtQwRnw8K1uiLWw",authDomain:"inviata-os-ea6d3.firebaseapp.com",projectId:"inviata-os-ea6d3",storageBucket:"inviata-os-ea6d3.firebasestorage.app",messagingSenderId:"836729940894",appId:"1:836729940894:web:c38a19cbf0528a93a0848f"};

const app=initializeApp(firebaseConfig),db=getFirestore(app);

export { app, db, collection, onSnapshot, updateDoc, deleteDoc, doc, serverTimestamp };

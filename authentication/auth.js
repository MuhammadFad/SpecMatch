import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

 const firebaseConfig = {
    apiKey: "AIzaSyCywnIfR3dhZAWLT-1Nn6iz_6BCBgipLqE",
    authDomain: "specmatch-auth.firebaseapp.com",
    projectId: "specmatch-auth",
    storageBucket: "specmatch-auth.firebasestorage.app",
    messagingSenderId: "170230638392",
    appId: "1:170230638392:web:b321a6925f740afd16c3cd",
    measurementId: "G-EJN8RJ4CPH"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const msg = document.getElementById("msg");

// EMAIL SIGNUP
window.signup = () => {
  createUserWithEmailAndPassword(auth, email.value, password.value)
    .then(res => handleUser(res.user))
    .catch(err => msg.innerText = err.message);
};

// EMAIL LOGIN
window.login = () => {
  signInWithEmailAndPassword(auth, email.value, password.value)
    .then(res => handleUser(res.user))
    .catch(err => msg.innerText = err.message);
};

// GOOGLE LOGIN
window.googleSignup = () => {
  signInWithPopup(auth, provider)
    .then(res => handleUser(res.user))
    .catch(err => msg.innerText = err.message);
};

// USER OBJECT
function handleUser(user) {
  const userObj = {
    firebaseUID: user.uid,
    email: user.email,
    name: user.displayName || "",
    provider: user.providerData[0].providerId,
    createdAt: new Date()
  };

  saveUser(userObj);
  msg.innerText = "Authentication Successful ✔";
}

// SEND TO BACKEND
function saveUser(userObj) {
  fetch("http://localhost:5000/save-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userObj)
  });
}

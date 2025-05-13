// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import{getFirestore, setDoc, doc, getDoc, updateDoc, collection, query, getDocs, where} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js"

const firebaseConfig = {
    apiKey: "AIzaSyBhgQ-3m6DcXGZlDg6kq2Jx7Ei4ORHVJPE",

    authDomain: "login-form-f98c7.firebaseapp.com",

    projectId: "login-form-f98c7",

    storageBucket: "login-form-f98c7.firebasestorage.app",

    messagingSenderId: "174637943387",

    appId: "1:174637943387:web:45fe45fe97f2699ee04d7e",

    measurementId: "G-QX0XXWB1Q6"

};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Check if we're on the login page
const isLoginPage = window.location.pathname.includes('login.html');

function showMessage(message, divId, isSuccess = true) {
   var messageDiv = document.getElementById(divId);
   if (!messageDiv) return;
   
   messageDiv.style.display = "block";
   messageDiv.innerHTML = message;
   messageDiv.classList.remove('success', 'error');
   messageDiv.classList.add(isSuccess ? 'success' : 'error');
   messageDiv.style.opacity = 1;
   setTimeout(function(){
       messageDiv.style.opacity = 0;
       setTimeout(() => {
           messageDiv.style.display = "none";
       }, 300);
   }, 3000);
}

const signUp = document.getElementById('submitSignUp');
signUp.addEventListener('click', async (event) => {
   event.preventDefault();
   const email = document.getElementById('rEmail').value;
   const password = document.getElementById('rPassword').value;
   const firstName = document.getElementById('fName').value;
   const lastName = document.getElementById('lName').value;

   if (!email || !password || !firstName || !lastName) {
       showMessage('Please fill in all fields', 'signUpMessage', false);
       return;
   }

   const auth = getAuth();
   const db = getFirestore();

   try {
       const userCredential = await createUserWithEmailAndPassword(auth, email, password);
       const user = userCredential.user;
       const userData = {
           email: email,
           firstName: firstName,
           lastName: lastName,
           isNewUser: true,
           createdAt: new Date().toISOString()
       };

       await setDoc(doc(db, "users", user.uid), userData);
       showMessage('Account Created Successfully! Redirecting to login...', 'signUpMessage', true);
       
       // Redirect to login page after a short delay
       setTimeout(() => {
           window.location.href = 'login.html';
       }, 2000);
   } catch (error) {
       console.error("Registration error:", error);
       const errorMessage = error.code === 'auth/email-already-in-use' 
           ? 'Email Address Already Exists!'
           : 'Unable to create account. Please try again.';
       showMessage(errorMessage, 'signUpMessage', false);
   }
});

const signIn = document.getElementById('submitSignIn');
signIn.addEventListener('click', async (event) => {
   event.preventDefault();
   const email = document.getElementById('email').value;
   const password = document.getElementById('password').value;

   if (!email || !password) {
       showMessage('Please enter both email and password', 'signInMessage', false);
       return;
   }

   const auth = getAuth();
   const db = getFirestore();

   try {
       // First attempt to sign in
       const userCredential = await signInWithEmailAndPassword(auth, email, password);
       const user = userCredential.user;
       localStorage.setItem('loggedInUserId', user.uid);

       // Get user data
       const userDoc = await getDoc(doc(db, "users", user.uid));
       
       if (!userDoc.exists()) {
           showMessage('Error: User data not found', 'signInMessage', false);
           return;
       }

       const userData = userDoc.data();

       // Check if this is a new user (never completed onboarding)
       if (userData && userData.isNewUser === true) {
           // Show permissions dialog for new users
           showMessage('Please set up your permissions', 'signInMessage', true);
           document.getElementById('permissionDialog').style.display = 'block';
       } else {
           // Direct login to home for existing users
           showMessage('Login successful! Redirecting...', 'signInMessage', true);
           setTimeout(() => {
               window.location.href = '../../home.html';
           }, 1500);
       }
   } catch (error) {
       console.error("Sign in error:", error);
       let errorMessage = 'An error occurred during login';
       
       switch(error.code) {
           case 'auth/invalid-credential':
           case 'auth/wrong-password':
               errorMessage = 'Incorrect email or password';
               break;
           case 'auth/user-not-found':
               errorMessage = 'Account not found. Please sign up first';
               break;
           case 'auth/invalid-email':
               errorMessage = 'Invalid email format';
               break;
           case 'auth/user-disabled':
               errorMessage = 'This account has been disabled';
               break;
       }
       showMessage(errorMessage, 'signInMessage', false);
   }
});

// Handle permissions and navigation
document.addEventListener('DOMContentLoaded', () => {
    // Only run this code if we're on a page that needs permissions
    if (!document.getElementById('permissionDialog')) return;

    const micButton = document.querySelector('.mic-button');
    const locationButton = document.querySelector('.location-button');
    const continueButton = document.getElementById('continueButton');
    const db = getFirestore();

    let micPermissionGranted = false;
    let locationPermissionGranted = false;

    // Initialize continue button state
    if (continueButton) {
        continueButton.disabled = true;
    }

    // Microphone permission
    micButton?.addEventListener('click', async () => {
        if (micPermissionGranted) {
            // If already granted, toggle off
            micPermissionGranted = false;
            micButton.innerHTML = '<i class="fas fa-toggle-off"></i><span>Enable</span>';
            micButton.classList.remove('enabled');
        } else {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                micPermissionGranted = true;
                micButton.innerHTML = '<i class="fas fa-toggle-on"></i><span>Enabled</span>';
                micButton.classList.add('enabled');
            } catch (err) {
                console.error('Mic permission denied:', err);
                micPermissionGranted = false;
                micButton.innerHTML = '<i class="fas fa-toggle-off"></i><span>Enable</span>';
                micButton.classList.remove('enabled');
            }
        }
        updateContinueButtonState();
    });

    // Location permission
    locationButton?.addEventListener('click', async () => {
        if (locationPermissionGranted) {
            // If already granted, toggle off
            locationPermissionGranted = false;
            locationButton.innerHTML = '<i class="fas fa-toggle-off"></i><span>Enable</span>';
            locationButton.classList.remove('enabled');
        } else {
            try {
                await navigator.geolocation.getCurrentPosition(() => {});
                locationPermissionGranted = true;
                locationButton.innerHTML = '<i class="fas fa-toggle-on"></i><span>Enabled</span>';
                locationButton.classList.add('enabled');
            } catch (err) {
                console.error('Location permission denied:', err);
                locationPermissionGranted = false;
                locationButton.innerHTML = '<i class="fas fa-toggle-off"></i><span>Enable</span>';
                locationButton.classList.remove('enabled');
            }
        }
        updateContinueButtonState();
    });

    function updateContinueButtonState() {
        if (continueButton) {
            continueButton.disabled = !(micPermissionGranted || locationPermissionGranted);
            // Update button appearance based on state
            if (continueButton.disabled) {
                continueButton.classList.remove('enabled');
            } else {
                continueButton.classList.add('enabled');
            }
        }
    }

    // Continue button
    continueButton?.addEventListener('click', async () => {
        if (!(micPermissionGranted || locationPermissionGranted)) {
            showMessage('Please enable at least one permission to continue', 'signInMessage', false);
            return;
        }

        const userId = localStorage.getItem('loggedInUserId');
        if (userId) {
            try {
                // Double check this is actually a new user before updating
                const userDoc = await getDoc(doc(db, "users", userId));
                if (!userDoc.exists() || !userDoc.data().isNewUser) {
                    window.location.href = '../../home.html';
                    return;
                }

                // Update user's permission status and isNewUser flag
                const userRef = doc(db, "users", userId);
                await updateDoc(userRef, {
                    micPermission: micPermissionGranted,
                    locationPermission: locationPermissionGranted,
                    isNewUser: false,
                    lastUpdated: new Date().toISOString()
                });
                
                showMessage('Permissions saved successfully!', 'signInMessage', true);
                setTimeout(() => {
                    // Navigate to preferences page
                    window.location.href = 'pref.html';
                }, 1000);
            } catch (error) {
                console.error("Error updating permissions:", error);
                showMessage('Error saving permissions. Please try again.', 'signInMessage', false);
            }
        }
    });
});
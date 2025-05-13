document.addEventListener('DOMContentLoaded', function() {
    const signUpButton = document.getElementById('signUpButton');
    const signInButton = document.getElementById('signInButton');
    const signInForm = document.getElementById('signIn');
    const signUpForm = document.getElementById('signup');
    const permissionDialog = document.getElementById('permissionDialog');

    // Clear any existing login state when arriving at login page
    if (window.location.pathname.includes('login.html')) {
        localStorage.removeItem('loggedInUserId');
    }

    // Hide permission dialog by default
    if (permissionDialog) {
        permissionDialog.style.display = 'none';
    }

    function switchForm(hideForm, showForm) {
        hideForm.style.opacity = '0';
        setTimeout(() => {
            hideForm.style.display = 'none';
            showForm.style.display = 'block';
            setTimeout(() => {
                showForm.style.opacity = '1';
            }, 50);
        }, 300);
        clearForms();
    }

    function clearForms() {
        // Clear form fields
        document.getElementById('email').value = '';
        document.getElementById('password').value = '';
        document.getElementById('fName').value = '';
        document.getElementById('lName').value = '';
        document.getElementById('rEmail').value = '';
        document.getElementById('rPassword').value = '';
        
        // Reset message divs
        const messageDivs = document.querySelectorAll('.messageDiv');
        messageDivs.forEach(div => {
            div.style.display = 'none';
            div.classList.remove('success', 'error');
        });
        
        // Reset password visibility
        const passwordFields = document.querySelectorAll('input[type="password"]');
        const eyeIcons = document.querySelectorAll('.password-toggle i');
        passwordFields.forEach(field => field.type = 'password');
        eyeIcons.forEach(icon => {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        });

        // Hide permission dialog
        if (permissionDialog) {
            permissionDialog.style.display = 'none';
        }
    }

    signUpButton.addEventListener('click', () => {
        switchForm(signInForm, signUpForm);
    });

    signInButton.addEventListener('click', () => {
        switchForm(signUpForm, signInForm);
    });

    // Password toggle functionality
    document.getElementById('showPassword').addEventListener('click', function() {
        const passwordField = document.getElementById('password');
        togglePassword(passwordField, this);
    });

    document.getElementById('rShowPassword').addEventListener('click', function() {
        const passwordField = document.getElementById('rPassword');
        togglePassword(passwordField, this);
    });

    function togglePassword(passwordField, icon) {
        if (passwordField.type === 'password') {
            passwordField.type = 'text';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        } else {
            passwordField.type = 'password';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    }

    // Handle permission dialog close on outside click
    window.addEventListener('click', (e) => {
        if (e.target === permissionDialog) {
            // Don't allow closing the dialog by clicking outside
            e.preventDefault();
        }
    });

    // Permission button handlers
    const micButton = document.querySelector('.mic-button');
    const locationButton = document.querySelector('.location-button');
    const continueButton = document.querySelector('.continue-btn');

    function updateContinueButtonState() {
        const micEnabled = micButton.classList.contains('enabled');
        const locationEnabled = locationButton.classList.contains('enabled');
        
        if (micEnabled || locationEnabled) {
            continueButton.disabled = false;
            continueButton.classList.add('enabled');
        } else {
            continueButton.disabled = true;
            continueButton.classList.remove('enabled');
        }
    }

    function togglePermissionButton(button) {
        const isEnabled = button.classList.contains('enabled');
        if (isEnabled) {
            button.classList.remove('enabled');
            button.innerHTML = `<i class="fas fa-toggle-off"></i><span>Enable</span>`;
        } else {
            button.classList.add('enabled');
            button.innerHTML = `<i class="fas fa-toggle-on"></i><span>Enabled</span>`;
        }
        updateContinueButtonState();
    }

    if (micButton) {
        micButton.addEventListener('click', () => togglePermissionButton(micButton));
    }

    if (locationButton) {
        locationButton.addEventListener('click', () => togglePermissionButton(locationButton));
    }

    // Initialize continue button state
    if (continueButton) {
        continueButton.disabled = true;
        continueButton.classList.remove('enabled');
    }
});
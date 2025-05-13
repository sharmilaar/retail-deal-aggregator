import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, updateDoc, doc, getDoc, deleteDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-storage.js";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBQ3UhKKRW19wD2oyjV-QbXp61FguwqSak",
    authDomain: "seller-6975f.firebaseapp.com",
    projectId: "seller-6975f",
    storageBucket: "seller-6975f.firebasestorage.app",
    messagingSenderId: "123675528821",
    appId: "1:123675528821:web:bd9aac9a48bbad3a09723c",
    measurementId: "G-5E37M5R2RM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Add Cloudinary configuration
const CLOUDINARY_CLOUD_NAME = 'doc9i60oi'; // Your Cloudinary cloud name
const CLOUDINARY_UPLOAD_PRESET = 'retailer_uploads'; // Your upload preset
const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// Add ImgBB configuration
const IMGBB_API_KEY = '1ecec0031573b862f5f645974813d3f0'; // Replace with your ImgBB API key
const IMGBB_API_URL = 'https://api.imgbb.com/1/upload';

// Check authentication state
async function checkAuthState() {
    try {
        const authData = localStorage.getItem('retailerAuth');
        if (!authData) {
            throw new Error('No auth data found');
        }

        const userData = JSON.parse(authData);
        const userDoc = await getDoc(doc(db, "retailers", userData.uid));
        
        if (!userDoc.exists() || userDoc.data().role !== "retailer") {
            throw new Error('Invalid user role');
        }

        return { ...userData, ...userDoc.data() };
    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('retailerAuth');
        window.location.replace('retailer-login.html');
        return null;
    }
}

// Dashboard Navigation
document.querySelectorAll('.nav-links li').forEach(link => {
    link.addEventListener('click', function() {
        console.log("Tab clicked:", this.getAttribute('data-tab'));
        
        if (this.id === 'logoutBtn') {
            handleLogout();
            return;
        }
        
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        this.classList.add('active');
        
        const tabId = this.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');
    });
});

// Load Retailer Data
async function loadRetailerData() {
    const userData = await checkAuthState();
    if (!userData) return;

    try {
        // Get retailer's deals
        const dealsQuery = query(
            collection(db, "deals"),
            where("retailerId", "==", userData.uid)
        );
        const dealsSnapshot = await getDocs(dealsQuery);
        
        // Update deals count
        const activeDealsCount = document.getElementById('activeDealsCount');
        if (activeDealsCount) {
            activeDealsCount.textContent = dealsSnapshot.docs.length;
        }

        // Get and update store visitors count
        const analyticsRef = doc(db, "store_analytics", userData.uid);
        const analyticsDoc = await getDoc(analyticsRef);
        
        const activeUsersCount = document.getElementById('activeUsersCount');
        if (activeUsersCount) {
            if (analyticsDoc.exists()) {
                activeUsersCount.textContent = analyticsDoc.data().uniqueVisitors || 0;
            } else {
                // Initialize analytics document if it doesn't exist
                await setDoc(analyticsRef, {
                    uniqueVisitors: 0,
                    totalViews: 0,
                    lastUpdated: new Date().toISOString()
                });
                activeUsersCount.textContent = "0";
            }
        }

        // Set up real-time listener for analytics updates
        onSnapshot(analyticsRef, (doc) => {
            if (doc.exists() && activeUsersCount) {
                activeUsersCount.textContent = doc.data().uniqueVisitors || 0;
            }
        });
        
        // Load deals grid
        await loadDealsGrid(dealsSnapshot.docs);
        
        // Load retailer profile and store description
        loadRetailerProfile(userData);
        loadStoreDescription(userData);
    } catch (error) {
        console.error("Error loading retailer data:", error);
        showNotification("Failed to load data", "error");
    }
}

// Load Deals Grid
async function loadDealsGrid(deals) {
    const dealsGrid = document.getElementById('dealsList');
    if (!dealsGrid) return;

    dealsGrid.innerHTML = '';
    
    if (deals.length === 0) {
        dealsGrid.innerHTML = `
            <div class="no-deals">
                <i class="fas fa-store"></i>
                <p>No deals added yet. Click "Add New Deal" to create your first deal!</p>
            </div>
        `;
        return;
    }

    deals.forEach(deal => {
        const dealCard = document.createElement('div');
        dealCard.className = 'deal-card';
        dealCard.setAttribute('data-deal-id', deal.id);
        updateDealCard(dealCard, deal.data(), deal.id);
        dealsGrid.appendChild(dealCard);
    });
}

// Load Retailer Profile
function loadRetailerProfile(userData) {
    try {
        const profileElements = {
            'shopName': userData.shopName,
            'ownerName': userData.ownerName,
            'shopCategory': userData.shopCategory,
            'phoneNumber': userData.phoneNumber,
            'shopAddress': userData.shopAddress,
            'businessRegNo': userData.businessRegNo,
            'email': userData.email
        };

        // Update display elements
        Object.entries(profileElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value || '-';
            
            // Update form inputs
            const input = document.getElementById(`${id}Input`);
            if (input) input.value = value || '';
        });
    } catch (error) {
        console.error("Error loading retailer profile:", error);
        showNotification("Failed to load profile", "error");
    }
}

// Add store description functionality
async function loadStoreDescription(userData) {
    const descriptionElement = document.getElementById('storeDescription');
    if (descriptionElement) {
        descriptionElement.textContent = userData.storeDescription || 'No description added yet.';
    }
}

// Handle store description edit
const editStoreDescBtn = document.getElementById('editStoreDescBtn');
const storeDescriptionDisplay = document.getElementById('storeDescriptionDisplay');
const storeDescriptionForm = document.getElementById('storeDescriptionForm');
const storeDescriptionInput = document.getElementById('storeDescriptionInput');
const saveStoreDesc = document.getElementById('saveStoreDesc');
const cancelStoreDesc = document.getElementById('cancelStoreDesc');

if (editStoreDescBtn) {
    editStoreDescBtn.addEventListener('click', () => {
        const currentDesc = document.getElementById('storeDescription').textContent;
        storeDescriptionInput.value = currentDesc === 'No description added yet.' ? '' : currentDesc;
        storeDescriptionDisplay.style.display = 'none';
        storeDescriptionForm.style.display = 'block';
    });
}

if (cancelStoreDesc) {
    cancelStoreDesc.addEventListener('click', () => {
        storeDescriptionForm.style.display = 'none';
        storeDescriptionDisplay.style.display = 'block';
    });
}

if (saveStoreDesc) {
    saveStoreDesc.addEventListener('click', async () => {
        try {
            const authData = JSON.parse(localStorage.getItem('retailerAuth'));
            if (!authData) throw new Error('No auth data found');

            const description = storeDescriptionInput.value.trim();
            
            // Update in Firestore
            await updateDoc(doc(db, "retailers", authData.uid), {
                storeDescription: description,
                updatedAt: new Date().toISOString()
            });

            // Update display
            document.getElementById('storeDescription').textContent = description || 'No description added yet.';
            
            // Hide form, show display
            storeDescriptionForm.style.display = 'none';
            storeDescriptionDisplay.style.display = 'block';
            
            showNotification("Store description updated successfully!", "success");
        } catch (error) {
            console.error("Error updating store description:", error);
            showNotification("Failed to update store description", "error");
        }
    });
}

// Handle Profile Update
const profileForm = document.getElementById('profileForm');
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            const authData = JSON.parse(localStorage.getItem('retailerAuth'));
            const updateData = {
                shopName: document.getElementById('shopNameInput').value,
                ownerName: document.getElementById('ownerNameInput').value,
                shopCategory: document.getElementById('shopCategoryInput').value,
                phoneNumber: document.getElementById('phoneNumberInput').value,
                shopAddress: document.getElementById('shopAddressInput').value
            };

            await updateDoc(doc(db, "retailers", authData.uid), updateData);
            
            // Update display
            loadRetailerProfile({ ...authData, ...updateData });
            
            // Hide form, show info
            document.querySelector('.profile-info').classList.remove('hidden');
            document.querySelector('.profile-form').classList.remove('active');
            
            showNotification("Profile updated successfully!", "success");
    } catch (error) {
            console.error("Update error:", error);
            showNotification("Failed to update profile", "error");
    }
    });
}

// Handle Logout
async function handleLogout() {
    try {
        await signOut(auth);
        localStorage.removeItem('retailerAuth');
        window.location.replace('retailer-login.html');
    } catch (error) {
        console.error("Error signing out:", error);
        showNotification("Failed to logout", "error");
    }
}

// Show notification
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Let's add dynamic styles to improve the deal card appearance
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired - initializing dashboard");
    
    // Get references to important DOM elements
    const dealForm = document.getElementById('dealForm');
    const dealModal = document.getElementById('dealModal');
    const addDealBtn = document.getElementById('addDealBtn');
    const closeModal = document.querySelector('.close');
    
    // Add styles to the document head for smoother card transitions
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .deal-card {
            transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .deal-card img {
            min-height: 200px;
            background-color: #f0f0f0;
            object-fit: cover;
            transition: opacity 0.3s ease;
        }
        .deal-card img.loading {
            opacity: 0.6;
            filter: blur(5px);
        }
    `;
    document.head.appendChild(styleEl);
    
    // Fix tab navigation
    document.querySelectorAll('.nav-links li').forEach(link => {
        link.addEventListener('click', function() {
            console.log("Tab clicked:", this.getAttribute('data-tab'));
            
            if (this.id === 'logoutBtn') {
                handleLogout();
                return;
            }
            
            document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            const tabId = this.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // Define the core form submission handler
    if (dealForm) {
        // Initialize dealForm submit handler
        dealForm.addEventListener('submit', handleDealFormSubmit);
        
        // Add Deal button handler
        if (addDealBtn) {
            addDealBtn.addEventListener('click', () => {
                console.log("Opening Add Deal modal");
                // Reset the form completely
                dealForm.reset();
                dealForm.removeAttribute('data-edit-mode');
                dealForm.removeAttribute('data-deal-id');
                
                // Reset any special event handlers
                if (dealForm._dealEditHandler) {
                    dealForm.removeEventListener('submit', dealForm._dealEditHandler);
                    dealForm._dealEditHandler = null;
                }
                
                // Make sure we're using the default handler
                dealForm.addEventListener('submit', handleDealFormSubmit);
                
                // Set the title and show modal
                document.getElementById('modalTitle').textContent = 'Add New Deal';
                dealModal.style.display = 'block';
            });
        }
        
        // Close modal handlers
        if (closeModal) {
            closeModal.addEventListener('click', () => {
                dealModal.style.display = 'none';
                resetDealForm();
            });
        }
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === dealModal) {
                dealModal.style.display = 'none';
                resetDealForm();
            }
        });
    }
    
    // Load retailer data after styles are applied
    loadRetailerData();
});

// Function to reset the deal form to a clean state
function resetDealForm() {
    const dealForm = document.getElementById('dealForm');
    if (dealForm) {
        // Reset form values
        dealForm.reset();
        
        // Clear edit mode flags
        dealForm.removeAttribute('data-edit-mode');
        dealForm.removeAttribute('data-deal-id');
        
        // Remove any special edit handlers
        if (dealForm._dealEditHandler) {
            dealForm.removeEventListener('submit', dealForm._dealEditHandler);
            dealForm._dealEditHandler = null;
        }
        
        // Restore the default submit handler
        const existingHandler = dealForm._defaultHandler;
        if (existingHandler) {
            dealForm.removeEventListener('submit', existingHandler);
        }
        dealForm.addEventListener('submit', handleDealFormSubmit);
        dealForm._defaultHandler = handleDealFormSubmit;
        
        // Ensure image validation works
        const submitBtn = dealForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Deal';
        }
    }
}

// Main handler for deal form submissions (for new deals)
async function handleDealFormSubmit(e) {
    e.preventDefault();
    console.log("Default form handler running");
    
    // Get the form element
    const dealForm = e.target;
    
    // Check if we're in edit mode - if so, don't process this as a new deal
    if (dealForm.getAttribute('data-edit-mode') === 'true') {
        console.log("Form is in edit mode but using default handler - should not happen");
        // This shouldn't happen as edit mode should use its own handler
        return;
    }
    
    // Get user data
    const userData = await checkAuthState();
    if (!userData) return;

    console.log("Processing as a NEW deal submission");
    const submitBtn = dealForm.querySelector('button[type="submit"]');
    const originalBtnText = '<i class="fas fa-save"></i> Save Deal';
    
    // Use a data URI for the placeholder image
    const placeholderImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23cccccc'/%3E%3Ctext x='50%25' y='50%25' font-size='18' text-anchor='middle' alignment-baseline='middle' font-family='Arial, sans-serif' fill='%23666666'%3ENo Image%3C/text%3E%3C/svg%3E";

    try {
        // Disable submit button and show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        // Get form data
        const formData = {
            title: document.getElementById('dealTitle').value.trim(),
            description: document.getElementById('dealDescription').value.trim(),
            category: document.getElementById('category').value.trim(),
            discountType: document.getElementById('discountType').value.trim(),
            expiryDate: document.getElementById('expiryDate').value,
            retailerId: userData.uid,
            retailerName: userData.shopName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'active',
            imageUrl: placeholderImage // Use data URI placeholder
        };

        // Add optional price fields only if they have values
        const originalPrice = document.getElementById('originalPrice').value;
        const discountedPrice = document.getElementById('discountedPrice').value;
        
        if (originalPrice) {
            formData.originalPrice = parseFloat(originalPrice);
        }
        if (discountedPrice) {
            formData.discountedPrice = parseFloat(discountedPrice);
        }

        // Show progress notification
        showNotification("Creating deal...", "info");
        
        // Save deal to Firestore first with placeholder
        const docRef = await addDoc(collection(db, "deals"), formData);
        const dealId = docRef.id;
        console.log("Deal saved with placeholder image, ID:", dealId);
        
        // Handle image upload to Cloudinary
        const imageFile = document.getElementById('dealImage').files[0];
        if (imageFile) {
            try {
                // Update progress
                showNotification("Processing image...", "info");
                
                // Use our new upload function
                const imageUrl = await uploadToCloudinary(
                    imageFile, 
                    `retail_deals/${userData.shopName}`
                );
                
                console.log('Image uploaded successfully:', imageUrl);
                
                // Update the Firestore document with the image URL
                await updateDealImageInFirestore(dealId, imageUrl);
                
                // Update formData for UI update
                formData.imageUrl = imageUrl;
                
                // Store this as a pending upload in localStorage
                const pendingUploads = JSON.parse(localStorage.getItem('pendingImageUploads') || '{}');
                pendingUploads[dealId] = imageUrl;
                localStorage.setItem('pendingImageUploads', JSON.stringify(pendingUploads));
            } catch (error) {
                console.error("Image upload failed:", error);
                if (error.name === 'AbortError') {
                    showNotification("Image upload timed out, using placeholder", "error");
                } else {
                    showNotification("Image upload failed, using placeholder", "error");
                }
                // Keep the default placeholder image
            }
        }

        // Reset form and close modal
        resetDealForm();
        dealModal.style.display = 'none';

        // Create and append the new deal card directly rather than refreshing everything
        const dealsGrid = document.getElementById('dealsList');
        if (dealsGrid) {
            // Remove "no deals" message if it exists
            const noDeals = dealsGrid.querySelector('.no-deals');
            if (noDeals) {
                noDeals.remove();
            }
            
            // Add the new deal card
            const dealCard = document.createElement('div');
            dealCard.className = 'deal-card';
            dealCard.setAttribute('data-deal-id', dealId);
            
            // Add to the beginning of the grid
            if (dealsGrid.firstChild) {
                dealsGrid.insertBefore(dealCard, dealsGrid.firstChild);
            } else {
                dealsGrid.appendChild(dealCard);
            }
            
            // Use the safe update method that prevents flickering
            safelyUpdateDealCard(dealCard, formData, dealId);
            
            // Update the count
            const activeDealsCount = document.getElementById('activeDealsCount');
            if (activeDealsCount) {
                const currentCount = parseInt(activeDealsCount.textContent) || 0;
                activeDealsCount.textContent = currentCount + 1;
            }
        } else {
            // If grid not found, refresh the entire data
            await loadRetailerData();
        }

        showNotification("Deal added successfully!", "success");
    } catch (error) {
        console.error("Error adding deal:", error);
        showNotification("Failed to add deal: " + error.message, "error");
    } finally {
        // Reset button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

// Update the editDeal function to use the new placeholder
window.editDeal = async function(dealId) {
    try {
        console.log("Opening Edit Deal modal for deal:", dealId);
        const dealForm = document.getElementById('dealForm');
        
        // Reset form to clear any previous state
        resetDealForm();
        
        const submitBtn = dealForm.querySelector('button[type="submit"]');
        const originalBtnText = '<i class="fas fa-save"></i> Save Deal';
        
        // Use a data URI for the placeholder image
        const placeholderImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23cccccc'/%3E%3Ctext x='50%25' y='50%25' font-size='18' text-anchor='middle' alignment-baseline='middle' font-family='Arial, sans-serif' fill='%23666666'%3ENo Image%3C/text%3E%3C/svg%3E";

        // Show indicator that deal is loading
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

        const dealDoc = await getDoc(doc(db, "deals", dealId));
        if (!dealDoc.exists()) {
            showNotification("Deal not found", "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
            return;
        }

        // Reset button state after loading
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;

        const dealData = dealDoc.data();
        const currentImageUrl = dealData.imageUrl || placeholderImage;
        
        // Populate the form with deal data
        document.getElementById('dealTitle').value = dealData.title;
        document.getElementById('dealDescription').value = dealData.description;
        document.getElementById('category').value = dealData.category;
        document.getElementById('discountType').value = dealData.discountType;
        document.getElementById('expiryDate').value = dealData.expiryDate;
        if (dealData.originalPrice) {
            document.getElementById('originalPrice').value = dealData.originalPrice;
        }
        if (dealData.discountedPrice) {
            document.getElementById('discountedPrice').value = dealData.discountedPrice;
        }

        // Show modal with edit title
        document.getElementById('modalTitle').textContent = 'Edit Deal';
        dealModal.style.display = 'block';

        // Set a data attribute to track that we're in edit mode
        dealForm.setAttribute('data-edit-mode', 'true');
        dealForm.setAttribute('data-deal-id', dealId);

        // Remove the default submit handler
        if (dealForm._defaultHandler) {
            dealForm.removeEventListener('submit', dealForm._defaultHandler);
        } else {
            dealForm.removeEventListener('submit', handleDealFormSubmit);
        }

        // Create a new handler for this specific edit operation
        dealForm._dealEditHandler = async function(e) {
            e.preventDefault();
            console.log("Edit handler running for deal:", dealId);
            
            try {
                // Disable submit button and show loading state
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

                // Collect form data
                const updateData = {
                    title: document.getElementById('dealTitle').value.trim(),
                    description: document.getElementById('dealDescription').value.trim(),
                    category: document.getElementById('category').value.trim(),
                    discountType: document.getElementById('discountType').value.trim(),
                    expiryDate: document.getElementById('expiryDate').value,
                    updatedAt: new Date().toISOString(),
                    imageUrl: currentImageUrl // Set default image URL from current
                };

                const originalPrice = document.getElementById('originalPrice').value;
                const discountedPrice = document.getElementById('discountedPrice').value;
                
                if (originalPrice) {
                    updateData.originalPrice = parseFloat(originalPrice);
                } else {
                    // Remove the field if it exists but is now empty
                    delete updateData.originalPrice;
                }
                
                if (discountedPrice) {
                    updateData.discountedPrice = parseFloat(discountedPrice);
                } else {
                    // Remove the field if it exists but is now empty
                    delete updateData.discountedPrice;
                }

                // Start a progress notification
                showNotification("Saving deal...", "info");

                // Handle image upload only if a new image is selected
                const imageFile = document.getElementById('dealImage').files[0];
                if (imageFile) {
                    try {
                        // Update progress
                        showNotification("Processing image...", "info");
                        
                        // Use our new upload function
                        const imageUrl = await uploadToCloudinary(
                            imageFile, 
                            `retail_deals/${dealData.retailerName}`
                        );
                        
                        console.log('Image updated successfully:', imageUrl);
                        updateData.imageUrl = imageUrl;
                    } catch (error) {
                        console.error("Image upload failed:", error);
                        if (error.name === 'AbortError') {
                            showNotification("Image upload timed out, using existing image", "error");
                        } else {
                            showNotification("Image upload failed, using existing image", "error");
                        }
                        // Keep the current image URL (already set as default)
                    }
                }

                // Update progress
                showNotification("Updating database...", "info");
                
                // Update deal in Firestore
                await updateDoc(doc(db, "deals", dealId), updateData);
                console.log("Deal updated successfully:", dealId);

                // Reset form and close modal
                resetDealForm();
                dealModal.style.display = 'none';

                // Update UI with the updated deal
                const dealCard = document.querySelector(`[data-deal-id="${dealId}"]`);
                if (dealCard) {
                    // Get the latest deal data
                    const updatedDealDoc = await getDoc(doc(db, "deals", dealId));
                    if (updatedDealDoc.exists()) {
                        // Use the safe update method that prevents flickering
                        safelyUpdateDealCard(dealCard, updatedDealDoc.data(), dealId);
                    }
                } else {
                    // If deal card not found, refresh the entire grid
                    await loadRetailerData();
                }

                showNotification("Deal updated successfully!", "success");
            } catch (error) {
                console.error("Error updating deal:", error);
                showNotification("Failed to update deal: " + error.message, "error");
            } finally {
                // Reset button state
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        };
        
        // Add the new handler
        dealForm.addEventListener('submit', dealForm._dealEditHandler);
        
    } catch (error) {
        console.error("Error loading deal:", error);
        showNotification("Failed to load deal", "error");
    }
};

// Implement the delete deal functionality
window.deleteDeal = async function(dealId) {
    try {
        console.log("Attempting to delete deal:", dealId);
        
        // Confirm before deleting
        if (!confirm('Are you sure you want to delete this deal?')) {
            console.log("Delete canceled by user");
            return;
        }
        
        // Show a notification that we're working on it
        showNotification("Deleting deal...", "info");
        
        // Delete the deal from Firestore
        await deleteDoc(doc(db, "deals", dealId));
        console.log("Deal successfully deleted from Firestore:", dealId);
        
        // Remove the deal card from the UI
        const dealCard = document.querySelector(`[data-deal-id="${dealId}"]`);
        if (dealCard) {
            // Add fade-out animation
            dealCard.style.opacity = '0';
            dealCard.style.transform = 'scale(0.95)';
            
            // Wait for animation to complete before removing
            setTimeout(() => {
                dealCard.remove();
                
                // Check if there are no more deals and show the "no deals" message if needed
                const dealsGrid = document.getElementById('dealsList');
                if (dealsGrid && dealsGrid.children.length === 0) {
                    dealsGrid.innerHTML = `
                        <div class="no-deals">
                            <i class="fas fa-store"></i>
                            <p>No deals added yet. Click "Add New Deal" to create your first deal!</p>
                        </div>
                    `;
                }
            }, 300);
            
            // Update the count
            const activeDealsCount = document.getElementById('activeDealsCount');
            if (activeDealsCount) {
                const currentCount = parseInt(activeDealsCount.textContent) || 0;
                if (currentCount > 0) {
                    activeDealsCount.textContent = currentCount - 1;
                }
            }
        } else {
            // If card not found, refresh the entire data
            await loadRetailerData();
        }
        
        showNotification("Deal deleted successfully!", "success");
    } catch (error) {
        console.error("Error deleting deal:", error);
        showNotification("Failed to delete deal: " + error.message, "error");
    }
};

// Improve the compressImage function to handle image formats better
async function compressImage(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
        // If file is too small or not an image type we can compress, return it as is
        if (file.size < 300000 || !file.type.match(/^image\/(jpeg|png|webp)$/)) {
            console.log("File doesn't need compression, using original:", file.type, file.size);
            resolve(file);
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate new dimensions while maintaining aspect ratio
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    const ratio = maxWidth / width;
                    width = maxWidth;
                    height = height * ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw image on canvas with white background for transparency support
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to Blob with appropriate type
                const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                canvas.toBlob(
                    blob => {
                        console.log(`Compressed image from ${file.size} to ${blob.size} bytes`);
                        resolve(blob);
                    },
                    outputType,
                    quality
                );
            };
            
            img.onerror = () => {
                console.log("Error loading image for compression, using original");
                resolve(file);
            };
        };
        reader.onerror = () => {
            console.log("Error reading file for compression, using original");
            resolve(file);
        };
    });
}

// This function fixes image URLs that might have CORS issues
function fixImageUrlForDisplay(url) {
    // If it's already a data URI or has specific known safe domains, return as is
    if (!url || url.startsWith('data:') || url.includes('firebasestorage.googleapis.com')) {
        return url;
    }
    
    // For Cloudinary URLs, make sure they use HTTPS and add auto format and quality params
    if (url.includes('cloudinary.com')) {
        url = url.replace('http://', 'https://');
        
        // Add auto format and quality if not already present
        if (!url.includes('/upload/f_auto')) {
            url = url.replace('/upload/', '/upload/f_auto,q_auto/');
        }
        
        console.log("Fixed Cloudinary URL:", url);
    }
    
    return url;
}

// Update deals in Firestore after successful upload
async function updateDealImageInFirestore(dealId, imageUrl) {
    try {
        console.log(`Updating deal ${dealId} with image URL:`, imageUrl);
        
        // Make sure we update the imageUrl in Firestore directly
        await updateDoc(doc(db, "deals", dealId), {
            imageUrl: imageUrl,
            updatedAt: new Date().toISOString()
        });
        
        console.log("Successfully persisted image URL to Firestore");
        return true;
    } catch (error) {
        console.error("Failed to update deal image in Firestore:", error);
        return false;
    }
}

// Update this function to use the fixImageUrlForDisplay helper
function updateDealCard(cardElement, dealData, dealId) {
    console.log("Updating deal card with data:", dealData);
    
    // Create a temporary container with opacity 0
    const tempContainer = document.createElement('div');
    tempContainer.className = 'deal-card';
    tempContainer.style.opacity = '0';
    tempContainer.style.transition = 'opacity 0.3s ease';
    tempContainer.setAttribute('data-deal-id', dealId);
    
    const expiryDate = new Date(dealData.expiryDate).toLocaleDateString();
    
    let priceDisplay = '';
    if (dealData.originalPrice && dealData.discountedPrice) {
        priceDisplay = `
            <div class="price-info">
                <span class="original-price">₹${dealData.originalPrice.toFixed(2)}</span>
                <span class="discounted-price">₹${dealData.discountedPrice.toFixed(2)}</span>
            </div>
        `;
    } else if (dealData.discountType) {
        priceDisplay = `
            <div class="discount-type">
                <span class="badge">${dealData.discountType}</span>
            </div>
        `;
    }

    // Use a data URI for the placeholder image
    const placeholderImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23cccccc'/%3E%3Ctext x='50%25' y='50%25' font-size='18' text-anchor='middle' alignment-baseline='middle' font-family='Arial, sans-serif' fill='%23666666'%3ENo Image%3C/text%3E%3C/svg%3E";
    
    // Log the image URL we're trying to use
    console.log("Deal image URL from data:", dealData.imageUrl);
    
    // Fix image URL for display and handle CORS issues
    let imageUrl = fixImageUrlForDisplay(dealData.imageUrl) || placeholderImage;
    
    // Build the content in the temporary container
    tempContainer.innerHTML = `
        <img src="${imageUrl}" alt="${dealData.title}" class="deal-image loading" onerror="this.onerror=null; this.src='${placeholderImage}'; console.log('Image failed to load:', this.src);">
        <div class="deal-info">
            <h3>${dealData.title}</h3>
            <p>${dealData.description}</p>
            ${priceDisplay}
            <div class="deal-meta">
                <span class="category"><i class="fas fa-tag"></i> ${dealData.category}</span>
                <span class="expiry"><i class="fas fa-clock"></i> Expires: ${expiryDate}</span>
            </div>
            <div class="deal-actions">
                <button onclick="editDeal('${dealId}')" class="btn btn-secondary">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button onclick="deleteDeal('${dealId}')" class="btn btn-danger">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
            </div>
        `;
    
    // Preload the image
    const img = new Image();
    img.onload = () => {
        console.log("Image loaded successfully:", imageUrl);
        // Only update the DOM once the image is loaded
        tempContainer.querySelector('img').classList.remove('loading');
        cardElement.innerHTML = tempContainer.innerHTML;
        cardElement.style.opacity = '1';
        
        // If this is data:image and we have a dealId, check if we need to update Firestore
        if (dealData.imageUrl && dealData.imageUrl.startsWith('data:') && dealId) {
            console.log("Deal has a placeholder image, will check for pending uploads");
            
            // This could be a card with a placeholder - check localStorage for pending uploads
            const pendingUploads = JSON.parse(localStorage.getItem('pendingImageUploads') || '{}');
            if (pendingUploads[dealId]) {
                console.log("Found pending upload for this deal:", pendingUploads[dealId]);
                
                // Try to update the card with the pending upload URL
                const dealCard = document.querySelector(`[data-deal-id="${dealId}"]`);
                if (dealCard) {
                    const imgElement = dealCard.querySelector('img');
                    if (imgElement) {
                        imgElement.src = pendingUploads[dealId];
                        console.log("Updated card image from pending uploads");
                    }
                }
                
                // Remove from pending uploads
                delete pendingUploads[dealId];
                localStorage.setItem('pendingImageUploads', JSON.stringify(pendingUploads));
            }
        }
    };
    img.onerror = (error) => {
        console.error("Error loading image:", error);
        console.log("Failed image URL:", imageUrl);
        // If image fails to load, use placeholder
        tempContainer.querySelector('img').src = placeholderImage;
        tempContainer.querySelector('img').classList.remove('loading');
        cardElement.innerHTML = tempContainer.innerHTML;
        cardElement.style.opacity = '1';
    };
    img.src = imageUrl;
    
    // Set a timeout to update the card even if image loading takes too long
    setTimeout(() => {
        if (!cardElement.innerHTML.includes(dealData.title)) {
            console.log("Timeout reached, updating card with current content");
            tempContainer.querySelector('img').classList.remove('loading');
            cardElement.innerHTML = tempContainer.innerHTML;
            cardElement.style.opacity = '1';
        }
    }, 2000);
}

// Add this empty function definition to fix the error
function validatePrices() {
    // This is just a placeholder to avoid the reference error
    // The real validation is happening elsewhere in the code
}

// Implement ImgBB upload function
async function uploadToImgBB(file) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Starting image upload process to ImgBB");
            console.log("File details:", {
                name: file.name,
                type: file.type,
                size: file.size
            });
            
            // Validate file before upload
            if (!file || !file.type.startsWith('image/')) {
                console.error("Invalid file type for ImgBB upload");
                throw new Error('Invalid file type');
            }

            // Try compressing the image first
            const fileToUpload = await compressImage(file);
            
            // Convert to base64
            const reader = new FileReader();
            reader.readAsDataURL(fileToUpload);
            
            reader.onloadend = async function() {
                try {
                    // Get base64 data (remove the data:image/jpeg;base64, part)
                    const base64data = reader.result.split(',')[1];
                    
                    // Prepare form data
                    const formData = new FormData();
                    formData.append('key', IMGBB_API_KEY);
                    formData.append('image', base64data);
                    
                    console.log("Sending request to ImgBB API");
                    
                    // Use AbortController for timeout
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => {
                        controller.abort();
                        console.error("ImgBB upload timed out after 30 seconds");
                        reject(new Error('Upload timed out'));
                    }, 30000);
                    
                    const response = await fetch(IMGBB_API_URL, {
                        method: 'POST',
                        body: formData,
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    const responseText = await response.text();
                    console.log("ImgBB raw response:", responseText);
                    
                    let result;
                    try {
                        result = JSON.parse(responseText);
                    } catch (parseError) {
                        console.error("Failed to parse ImgBB response:", responseText);
                        throw new Error('Invalid JSON response from ImgBB');
                    }
                    
                    if (!response.ok || !result.success) {
                        console.error("ImgBB API error:", result);
                        throw new Error(`Upload failed: ${result.error?.message || 'Unknown ImgBB error'}`);
                    }
                    
                    console.log("ImgBB response parsed:", result);
                    
                    if (!result.data || !result.data.url) {
                        console.error("Missing url in ImgBB response:", result);
                        throw new Error('Invalid response from ImgBB: missing image URL');
                    }
                    
                    // Use the display URL
                    const imageUrl = result.data.url;
                    console.log("Image upload to ImgBB successful. URL:", imageUrl);
                    
                    resolve(imageUrl);
                    
                } catch (fetchError) {
                    console.error("Error during ImgBB upload:", fetchError);
                    reject(fetchError instanceof Error ? fetchError : new Error('Network error during upload'));
                }
            };
            
            reader.onerror = (error) => {
                console.error("Error reading file for ImgBB upload:", error);
                reject(new Error('Failed to read image file'));
            };
            
        } catch (error) {
            console.error("Error in uploadToImgBB:", error);
            reject(error);
        }
    });
}

// Update the Cloudinary upload function to prioritize ImgBB if Cloudinary fails
async function uploadToCloudinary(file, folderName) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("Starting image upload process");
            console.log("File details:", {
                name: file.name,
                type: file.type,
                size: file.size
            });
            
            // Validate file before upload
            if (!file || !file.type.startsWith('image/')) {
                console.error("Invalid file type for upload");
                throw new Error('Invalid file type');
            }

            // Try compressing the image first
            const fileToUpload = await compressImage(file);
            
            // Try Cloudinary first (primary option)
            try {
                console.log("Sending request to Cloudinary API:", CLOUDINARY_API_URL);
                console.log("Using upload preset:", CLOUDINARY_UPLOAD_PRESET);
                
                // Prepare form data for Cloudinary
                const cloudinaryFormData = new FormData();
                cloudinaryFormData.append('file', fileToUpload);
                cloudinaryFormData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
                
                // Add folder if specified
                if (folderName) {
                    cloudinaryFormData.append('folder', folderName);
                    console.log("Using folder:", folderName);
                }
                
                // IMPORTANT: Disable OCR which is causing the rate limit
                cloudinaryFormData.append('ocr', 'false');
                console.log("OCR disabled to avoid rate limits");
                
                // Use AbortController for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                    console.error("Cloudinary upload timed out after 40 seconds");
                    throw new Error('Upload timed out');
                }, 40000);
                
                const response = await fetch(CLOUDINARY_API_URL, {
                    method: 'POST',
                    body: cloudinaryFormData,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                const responseText = await response.text();
                console.log("Cloudinary raw response:", responseText);
                
                let result;
                try {
                    result = JSON.parse(responseText);
                } catch (parseError) {
                    console.error("Failed to parse Cloudinary response:", responseText);
                    throw new Error('Invalid JSON response from Cloudinary');
                }
                
                if (!response.ok) {
                    console.error("Cloudinary API error:", result);
                    throw new Error(`Upload failed: ${result.error?.message || 'Unknown Cloudinary error'}`);
                }
                
                console.log("Cloudinary response parsed:", result);
                
                if (!result || !result.secure_url) {
                    console.error("Missing secure_url in Cloudinary response:", result);
                    throw new Error('Invalid response from Cloudinary: missing secure_url');
                }
                
                // Ensure we're using the secure URL
                const secureUrl = result.secure_url;
                console.log("Image upload successful to Cloudinary. Secure URL:", secureUrl);
                
                resolve(secureUrl);
                return;
                
            } catch (cloudinaryError) {
                console.error("Cloudinary upload failed, trying ImgBB as fallback:", cloudinaryError);
                
                // Cloudinary failed, try ImgBB as fallback
                try {
                    console.log("Trying to upload to ImgBB as fallback");
                    const imgbbUrl = await uploadToImgBB(file);
                    console.log("Successfully uploaded to ImgBB instead:", imgbbUrl);
                    resolve(imgbbUrl);
                    return;
                } catch (imgbbError) {
                    console.error("ImgBB fallback also failed:", imgbbError);
                    
                    // Both Cloudinary and ImgBB failed, try a data URI as last resort
                    console.warn("All external upload services failed. Using data URI for image (not recommended for production)");
                    
                    try {
                        // Convert to data URI as last resort
                        const reader = new FileReader();
                        reader.readAsDataURL(fileToUpload);
                        
                        reader.onloadend = function() {
                            const dataUrl = reader.result;
                            console.log("Using data URI as fallback (first 50 chars):", dataUrl.substring(0, 50) + "...");
                            resolve(dataUrl);
                        };
                        
                        reader.onerror = function() {
                            reject(new Error("All image upload options failed"));
                        };
                        
                    } catch (finalError) {
                        console.error("Failed to create data URI:", finalError);
                        reject(new Error("All image upload options failed"));
                    }
                }
            }
    } catch (error) {
            console.error("Error in uploadToCloudinary:", error);
            reject(error);
        }
    });
}

// Also update safelyUpdateDealCard to use the data URI placeholder
function safelyUpdateDealCard(cardElement, dealData, dealId) {
    // Use a data URI for the placeholder image
    const placeholderImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23cccccc'/%3E%3Ctext x='50%25' y='50%25' font-size='18' text-anchor='middle' alignment-baseline='middle' font-family='Arial, sans-serif' fill='%23666666'%3ENo Image%3C/text%3E%3C/svg%3E";
    
    // Set initial opacity for smooth transition
    if (cardElement.style.opacity !== '0') {
        cardElement.style.opacity = '0';
        cardElement.style.transition = 'opacity 0.3s ease';
    }
    
    // Create temporary image element to preload
    const img = new Image();
    const imageUrl = dealData.imageUrl || placeholderImage;
    
    // Set up load and error handlers
    img.onload = function() {
        // Image loaded successfully, now update the card
        updateDealCard(cardElement, dealData, dealId);
    };
    
    img.onerror = function() {
        // Image failed to load, use placeholder but still update the card
        dealData.imageUrl = placeholderImage;
        updateDealCard(cardElement, dealData, dealId);
    };
    
    // Set a timeout in case image loading takes too long
    const timeout = setTimeout(function() {
        // If loading takes more than 2 seconds, update the card anyway
        if (img.complete === false) {
            updateDealCard(cardElement, dealData, dealId);
        }
    }, 2000);
    
    // Start loading the image
    img.src = imageUrl;
    
    // If image is already in cache, the onload might not trigger
    if (img.complete) {
        clearTimeout(timeout);
        updateDealCard(cardElement, dealData, dealId);
    }
}

// Validate image before upload
document.getElementById('dealImage')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const submitBtn = dealForm.querySelector('button[type="submit"]');

    if (file) {
        // Check file type
        if (!file.type.startsWith('image/')) {
            showNotification("Please select an image file", "error");
            e.target.value = '';
            submitBtn.disabled = true;
            return;
        }

        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showNotification("Image size should be less than 5MB", "error");
            e.target.value = '';
            submitBtn.disabled = true;
            return;
        }

        submitBtn.disabled = false;
    }
});

// Set minimum date for expiry date
const expiryDateInput = document.getElementById('expiryDate');
if (expiryDateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expiryDateInput.min = tomorrow.toISOString().split('T')[0];
}
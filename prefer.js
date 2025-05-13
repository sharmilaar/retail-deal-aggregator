document.addEventListener("DOMContentLoaded", function () {
    let selectedStores = new Set();
    let selectedCategories = new Set();
    let currentFilter = 'all';
    let currentUser = null;
    
    // Initialize Firebase
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
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();
    
    // Updated stores list with categories
    let stores = [
        // Clothing category stores
        { name: "KV tex", category: "clothing" },
        { name: "Trends", category: "clothing" },
        { name: "Max", category: "clothing" },
        { name: "Rajendiras", category: "clothing" },
        { name: "Shanmuga Silks", category: "clothing" },
        
        // Footwear category stores
        { name: "Bata Foot Store", category: "footwear" },
        { name: "Skechers", category: "footwear" },
        { name: "Italiya Footwear", category: "footwear" },
        
        // Electronics category stores
        { name: "Mani Electronics", category: "electronics" },
        { name: "Girias", category: "electronics" },
        { name: "Darling Retail", category: "electronics" }
    ];

    // Add Pothys to all categories
    const categories = ["clothing", "footwear", "electronics"];
    categories.forEach(category => {
        stores.push({ name: "Pothys", category: category });
    });

    // Initialize stores list
    const storesList = document.getElementById('storesList');
    const storeSearch = document.getElementById('storeSearch');
    const filterButtons = document.querySelectorAll('.filter-btn');

    // Check authentication state
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            console.log("User logged in:", user.email);
            // Load saved preferences from Firebase
            try {
                const doc = await db.collection('userPreferences').doc(user.uid).get();
                if (doc.exists) {
                    const data = doc.data();
                    selectedStores = new Set(data.stores || []);
                    selectedCategories = new Set(data.categories || []);
                    
                    // Update UI with loaded preferences
                    renderStores(filterStores());
                    updateSelectedCounts();
                    
                    // Update category buttons
                    document.querySelectorAll('.category').forEach(button => {
                        const value = button.dataset.value;
                        if (selectedCategories.has(value)) {
                            button.classList.add('active');
                        }
                    });
                }
            } catch (error) {
                console.error("Error loading preferences:", error);
            }
        } else {
            console.log("No user logged in, redirecting to login");
            window.location.href = 'login.html';
        }
    });

    // Function to update selected counts
    function updateSelectedCounts() {
        document.querySelectorAll('.selected-count').forEach(count => {
            const type = count.closest('.section').querySelector('h3').textContent.toLowerCase();
            if (type.includes('stores')) {
                count.textContent = `${selectedStores.size} selected`;
            } else {
                count.textContent = `${selectedCategories.size} selected`;
            }
        });
    }

    // Function to render stores
    function renderStores(filteredStores = stores) {
        storesList.innerHTML = '';
        if (filteredStores.length === 0) {
            storesList.innerHTML = '<div class="no-results">No stores found</div>';
            return;
        }

        // Get unique stores to avoid duplicates
        const uniqueStores = new Set();
        filteredStores.forEach(store => uniqueStores.add(store.name));

        Array.from(uniqueStores).forEach(storeName => {
            const storeElement = document.createElement('div');
            storeElement.className = `store-item ${selectedStores.has(storeName) ? 'selected' : ''}`;
            storeElement.innerHTML = `
                <i class="fas fa-store"></i>
                <span>${storeName}</span>
            `;
            storeElement.addEventListener('click', () => toggleStore(storeName));
            storesList.appendChild(storeElement);
        });
    }

    // Function to toggle store selection
    function toggleStore(storeName) {
        if (selectedStores.has(storeName)) {
            selectedStores.delete(storeName);
        } else {
            selectedStores.add(storeName);
        }
        renderStores(filterStores());
        updateSelectedCounts();
    }

    // Function to filter stores based on search and category
    function filterStores() {
        const searchTerm = storeSearch.value.toLowerCase().trim();
        return stores.filter(store => {
            const matchesSearch = searchTerm === '' || store.name.toLowerCase().includes(searchTerm);
            const matchesCategory = currentFilter === 'all' || store.category === currentFilter;
            return matchesSearch && matchesCategory;
        });
    }

    // Search functionality with debounce
    let searchTimeout;
    storeSearch.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            console.log("Searching for:", storeSearch.value);
            renderStores(filterStores());
        }, 300);
    });

    // Filter buttons functionality
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentFilter = button.dataset.category;
            console.log("Filter changed to:", currentFilter);
            renderStores(filterStores());
        });
    });

    // Category selection functionality
    document.querySelectorAll('.category').forEach(button => {
        const value = button.dataset.value;
        const type = button.dataset.type;

        button.addEventListener('click', function() {
            if (type === 'category') {
                if (selectedCategories.has(value)) {
                    selectedCategories.delete(value);
                    this.classList.remove('active');
                } else {
                    selectedCategories.add(value);
                    this.classList.add('active');
                }
                updateSelectedCounts();
                console.log("Selected categories:", Array.from(selectedCategories));
            }
        });
    });

    // Save Preferences to Firebase
    document.getElementById('savePreferences').addEventListener('click', async function () {
        if (!currentUser) {
            alert('Please login to save preferences');
            window.location.href = 'login.html';
            return;
        }

        if (selectedStores.size === 0 || selectedCategories.size === 0) {
            alert('Please select at least one store and one category!');
            return;
        }

        try {
            console.log("Saving preferences for user:", currentUser.uid);

            // Convert Sets to Arrays for storage
            const preferences = {
                categories: Array.from(selectedCategories),
                stores: Array.from(selectedStores)
            };

            // Update the user document in the 'users' collection
            await db.collection('users').doc(currentUser.uid).update({
                preferences: preferences
            });

            alert('Preferences saved successfully! 🎉');
            window.location.href = '../../home.html';
        } catch (error) {
            console.error("Error saving preferences:", error);

            // Handle the case where the user document doesn't exist
            if (error.code === 'not-found') {
                alert('User document not found. Please contact support.');
            } else {
                alert('Error saving preferences. Please try again.');
            }
        }
    });

    // Initial render
    renderStores();
    updateSelectedCounts();
});

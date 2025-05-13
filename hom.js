import { initializeApp } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, setDoc, query, where, getDocs, addDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js";

// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBQ3UhKKRW19wD2oyjV-QbXp61FguwqSak",
    authDomain: "seller-6975f.firebaseapp.com",
    projectId: "seller-6975f",
    storageBucket: "seller-6975f.firebasestorage.app",
    messagingSenderId: "123675528821",
    appId: "1:123675528821:web:bd9aac9a48bbad3a09723c",
    measurementId: "G-5E37M5R2RM"
};

// Initialize Wishlist Database (Second Database)
const wishlistConfig = {
    apiKey: "AIzaSyBhgQ-3m6DcXGZlDg6kq2Jx7Ei4ORHVJPE",
    authDomain: "login-form-f98c7.firebaseapp.com",
    projectId: "login-form-f98c7",
    storageBucket: "login-form-f98c7.firebasestorage.app",
    messagingSenderId: "174637943387",
    appId: "1:174637943387:web:45fe45fe97f2699ee04d7e",
    measurementId: "G-QX0XXWB1Q6"
};

// Initialize Firebase Apps
const app = initializeApp(firebaseConfig);
const wishlistApp = initializeApp(wishlistConfig, "wishlist");

// Initialize Firestore
const db = getFirestore(app);
const wishlistDb = getFirestore(wishlistApp);

// Initialize Authentication
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const searchHistory = document.getElementById('searchHistory');
    let currentUser = null;

    // Initialize Firebase references
    const dealsDb = collection(db, 'deals');
    const searchHistoryDb = collection(wishlistDb, 'users');

    // Check authentication state
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            localStorage.setItem('loggedInUserId', user.uid);
            loadSearchHistory();
        } else {
            const storedUserId = localStorage.getItem('loggedInUserId');
            if (!storedUserId) {
                window.location.href = 'login.html';
            } else {
                currentUser = { uid: storedUserId };
                loadSearchHistory();
            }
        }
    });

    // Load search history
    async function loadSearchHistory() {
        if (!currentUser) return;
        try {
            const userDoc = await getDoc(doc(searchHistoryDb, currentUser.uid));
            if (userDoc.exists()) {
                const history = userDoc.data().searchHistory || [];
                displaySearchHistory(history);
            }
        } catch (error) {
            console.error('Error loading search history:', error);
        }
    }

    // Display search history
    function displaySearchHistory(history) {
        searchHistory.innerHTML = '';
        history.slice(0, 5).forEach(term => {
            const item = document.createElement('div');
            item.className = 'search-history-item';
            item.textContent = term;
            item.addEventListener('click', () => {
                searchInput.value = term;
                performSearch(term);
            });
            searchHistory.appendChild(item);
        });
    }

    // Save search term to history
    async function saveToSearchHistory(term) {
        if (!currentUser) return;
        try {
            const userRef = doc(searchHistoryDb, currentUser.uid);
            const userDoc = await getDoc(userRef);
            let history = [];
            
            if (userDoc.exists()) {
                history = userDoc.data().searchHistory || [];
            }
            
            // Remove if exists and add to front
            history = history.filter(h => h !== term);
            history.unshift(term);
            
            // Keep only last 10 searches
            history = history.slice(0, 10);
            
            await setDoc(userRef, { searchHistory: history }, { merge: true });
            displaySearchHistory(history);
        } catch (error) {
            console.error('Error saving search history:', error);
        }
    }

    // Deal card click handler
    document.querySelectorAll('.deal-card').forEach(card => {
        card.addEventListener('click', async function () {
            if (!currentUser) {
                alert('Please login to view deal details');
                window.location.href = 'login.html';
                return;
            }

            const dealId = this.getAttribute('data-deal-id');
            if (!dealId) {
                console.error('No deal ID found on card');
                return;
            }

            const dealData = await fetchDealDetails(dealId);
            if (dealData) {
                showDealDetails(dealData); // Ensure modal opens properly
            } else {
                alert('Failed to load deal details. Please try again.');
            }
        });
    });

    // Fix duplicate event listeners and ensure proper modal functionality
    document.querySelectorAll('.deal-card').forEach(card => {
        card.addEventListener('click', async function () {
            if (!currentUser) {
                alert('Please login to view deal details');
                window.location.href = 'login.html';
                return;
            }

            const dealId = this.getAttribute('data-deal-id');
            if (!dealId) {
                console.error('No deal ID found on card');
                return;
            }

            const dealData = await fetchDealDetails(dealId);
            if (dealData) {
                showDealDetails(dealData); // Ensure modal opens properly
            } else {
                alert('Failed to load deal details. Please try again.');
            }
        });
    });

    // Fetch deal details from Firestore
    async function fetchDealDetails(dealId) {
        try {
            const dealDoc = await getDoc(doc(dealsDb, dealId));
            if (dealDoc.exists()) {
                return { id: dealDoc.id, ...dealDoc.data() };
            }
        } catch (error) {
            console.error('Error fetching deal details:', error);
        }
        return null;
    }

    // Make showDealDetails available globally
    window.showDealDetails = async function(deal) {
        const modal = document.getElementById('dealModal');
        const modalContent = document.getElementById('dealModalContent');

        if (!modal || !modalContent) {
            console.error('Modal elements not found');
            return;
        }

        // Format dates
        const expiryDate = deal.expiryDate ? new Date(deal.expiryDate).toLocaleDateString() : 'No expiry';
        const startDate = deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : 'Unknown';

        // Format prices if available
        const originalPrice = deal.originalPrice ? `₹${deal.originalPrice}` : '';
        const discountedPrice = deal.discountedPrice ? `₹${deal.discountedPrice}` : '';

        // Check if item is in wishlist
        let isInWishlist = false;
        try {
            if (currentUser) {
                const userRef = doc(wishlistDb, "users", currentUser.uid);
                const userDoc = await getDoc(userRef);
                
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const wishlist = userData.wishlist || [];
                    isInWishlist = wishlist.some(item => item.dealId === deal.id);
                }
            }
        } catch (error) {
            console.error('Error checking wishlist status:', error);
        }

        // Create modal content
        modalContent.innerHTML = `
            <img src="${deal.imageUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'200\' viewBox=\'0 0 300 200\'%3E%3Crect width=\'300\' height=\'200\' fill=\'%23cccccc\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' font-size=\'18\' text-anchor=\'middle\' alignment-baseline=\'middle\' font-family=\'Arial, sans-serif\' fill=\'%23666666\'%3ENo Image%3C/text%3E%3C/svg%3E'}" 
                 alt="${deal.title || 'Deal'}" 
                 class="deal-modal-image"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'200\' viewBox=\'0 0 300 200\'%3E%3Crect width=\'300\' height=\'200\' fill=\'%23cccccc\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' font-size=\'18\' text-anchor=\'middle\' alignment-baseline=\'middle\' font-family=\'Arial, sans-serif\' fill=\'%23666666\'%3ENo Image%3C/text%3E%3C/svg%3E'">
            
            ${deal.discountType ? `<div class="deal-modal-badge">${deal.discountType}</div>` : ''}
            
            <div class="deal-modal-title">
                <span>${deal.title || 'Untitled Deal'}</span>
                <i class="fas fa-heart wishlist-icon ${isInWishlist ? 'active' : ''}" 
                   style="color: ${isInWishlist ? '#ff6547' : '#666'}; font-size: 24px; cursor: pointer; padding: 5px; display: inline-block;"
                   onclick="window.toggleWishlist(this, ${JSON.stringify(deal).replace(/"/g, '&quot;')})"></i>
            </div>
            
            ${(originalPrice || discountedPrice) ? `
                <div class="deal-modal-price">
                    ${originalPrice ? `<span style="text-decoration: line-through; color: #666; font-size: 14px;">${originalPrice}</span>` : ''}
                    ${discountedPrice ? `<span>${discountedPrice}</span>` : ''}
                </div>
            ` : ''}
            
            <div class="deal-modal-description">
                ${deal.description || 'No description available'}
            </div>
            
            <div class="deal-modal-dates">
                <div class="deal-modal-date-item">
                    <span>Start Date</span>
                    <strong>${startDate}</strong>
                </div>
                <div class="deal-modal-date-item">
                    <span>Expiry Date</span>
                    <strong>${expiryDate}</strong>
                </div>
            </div>
            
            <div class="deal-modal-info">
                <div class="shop-name-section">
                    <h3>Shop Information</h3>
                    <p>${deal.retailerName || 'Unknown'}</p>
                    <div class="shop-details">
                        <div class="shop-detail-item">
                            <strong>Category:</strong> ${deal.category || 'Uncategorized'}
                        </div>
                        ${deal.brand ? `
                            <div class="shop-detail-item">
                                <strong>Brand:</strong> ${deal.brand}
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                ${deal.features ? `
                    <div class="deal-modal-info-section">
                        <h3>Product Features</h3>
                        <p>${deal.features}</p>
                    </div>
                ` : ''}
                
                ${deal.specifications ? `
                    <div class="deal-modal-info-section">
                        <h3>Specifications</h3>
                        <p>${deal.specifications}</p>
                    </div>
                ` : ''}
            </div>
            
            ${deal.terms ? `
                <div class="deal-modal-terms">
                    <h3>Terms & Conditions</h3>
                    <p>${deal.terms}</p>
                </div>
            ` : ''}
        `;
        
        // Show modal
        modal.style.display = 'flex';
        modal.classList.add('show');
        
        // Add back button functionality
        const modalBackBtn = document.getElementById('modalBackBtn');
        modalBackBtn.onclick = function(e) {
            e.preventDefault();
            modal.style.display = 'none';
            modal.classList.remove('show');
        }

        // Add image click functionality
        const dealImage = modalContent.querySelector('.deal-modal-image');
        dealImage.onclick = function() {
            const imageViewerModal = document.getElementById('imageViewerModal');
            const viewerImage = document.getElementById('viewerImage');
            viewerImage.src = this.src;
            imageViewerModal.classList.add('show');
        }
    };

    // Add image viewer functionality
    const imageViewerModal = document.getElementById('imageViewerModal');
    const imageViewerClose = document.querySelector('.image-viewer-close');

    // Close image viewer when clicking the close button
    imageViewerClose.onclick = function() {
        imageViewerModal.classList.remove('show');
    }

    // Close image viewer when clicking outside the image
    imageViewerModal.onclick = function(e) {
        if (e.target === imageViewerModal) {
            imageViewerModal.classList.remove('show');
        }
    }

    // Perform search
    async function performSearch(query) {
        if (!query.trim()) {
            searchResults.classList.remove('active');
            return;
        }

        try {
            searchResults.innerHTML = '<div class="loading">Searching...</div>';
            searchResults.classList.add('active');

            const snapshot = await getDocs(dealsDb);
            const results = [];
            
            snapshot.forEach(doc => {
                const deal = doc.data();
                const searchableText = `${deal.title || ''} ${deal.category || ''} ${deal.retailerName || ''} ${deal.description || ''}`.toLowerCase();
                if (searchableText.includes(query.toLowerCase())) {
                    results.push({ id: doc.id, ...deal });
                }
            });

            // Sort results by date (newest first)
            results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            searchResults.innerHTML = '';

            if (results.length === 0) {
                searchResults.innerHTML = `
                    <div class="no-results">
                        <i class="fas fa-search" style="font-size: 24px; margin-bottom: 10px; color: #999;"></i>
                        <div>No deals found for "${query}"</div>
                    </div>`;
            } else {
                // Create a grid container for the deal cards
                const dealsGrid = document.createElement('div');
                dealsGrid.className = 'deals';
                dealsGrid.style.display = 'grid';
                dealsGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
                dealsGrid.style.gap = '15px';
                dealsGrid.style.padding = '10px';

                results.forEach(deal => {
                    const dealCard = document.createElement('div');
                    dealCard.className = 'deal-card';
                    dealCard.setAttribute('data-deal-id', deal.id);

                    const imageUrl = deal.imageUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23cccccc'/%3E%3Ctext x='50%25' y='50%25' font-size='18' text-anchor='middle' alignment-baseline='middle' font-family='Arial, sans-serif' fill='%23666666'%3ENo Image%3C/text%3E%3C/svg%3E";
                    
                    let discountBadge = '';
                    if (deal.discountType) {
                        discountBadge = `<div class="discount-badge">${deal.discountType}</div>`;
                    }
                    
                    const expiryDate = deal.expiryDate ? new Date(deal.expiryDate).toLocaleDateString() : 'No expiry';

                    dealCard.innerHTML = `
                        <img src="${imageUrl}" alt="${deal.title || 'Deal'}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'300\\' height=\\'200\\' viewBox=\\'0 0 300 200\\'%3E%3Crect width=\\'300\\' height=\\'200\\' fill=\\'%23cccccc\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' font-size=\\'18\\' text-anchor=\\'middle\\' alignment-baseline=\\'middle\\' font-family=\\'Arial, sans-serif\\' fill=\\'%23666666\\'%3ENo Image%3C/text%3E%3C/svg%3E'">
                        ${discountBadge}
                        <h4>${deal.title || 'Untitled Deal'}</h4>
                        <p>${deal.description ? (deal.description.substring(0, 50) + (deal.description.length > 50 ? '...' : '')) : 'No description available'}</p>
                        <div class="shop-info">
                            <strong>Shop:</strong> ${deal.retailerName || 'Unknown'}<br>
                            <strong>Expires:</strong> ${expiryDate}
                        </div>
                    `;

                    dealCard.addEventListener('click', () => {
                        showDealDetails(deal);
                    });

                    dealsGrid.appendChild(dealCard);
                });

                searchResults.appendChild(dealsGrid);
            }

            // Save search term to history
            saveToSearchHistory(query);
        } catch (error) {
            console.error('Error searching deals:', error);
            searchResults.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-exclamation-circle" style="font-size: 24px; margin-bottom: 10px; color: #ff6347;"></i>
                    <div>Error searching deals. Please try again.</div>
                </div>`;
        }
    }

    // Search input event listeners
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        clearTimeout(searchTimeout);
        
        if (query) {
            searchTimeout = setTimeout(() => {
                performSearch(query);
            }, 300); // Debounce search for better performance
        } else {
            searchResults.classList.remove('active');
        }
    });

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

    // Fix modal close functionality
    const modal = document.getElementById('dealModal');
    const modalBackBtn = document.getElementById('modalBackBtn');
    if (modalBackBtn) {
        modalBackBtn.onclick = function (e) {
            e.preventDefault();
            modal.style.display = 'none'; // Ensure modal closes properly
        };
    }

    // Add toggleWishlist function
    async function toggleWishlist(icon, dealData) {
        try {
            if (!currentUser) {
                alert('Please login to add items to wishlist');
                window.location.href = 'login.html';
                return;
            }

            // Get user document reference from wishlist database
            const userRef = doc(wishlistDb, "users", currentUser.uid);
            const userDoc = await getDoc(userRef);
            
            let userData = {
                uid: currentUser.uid,
                email: currentUser.email || '',
                createdAt: new Date(),
                status: "active",
                wishlist: []
            };

            if (userDoc.exists()) {
                const existingData = userDoc.data();
                userData = {
                    ...userData,
                    ...existingData,
                    wishlist: existingData.wishlist || []
                };
            }

            // Check if item is already in wishlist
            const itemIndex = userData.wishlist.findIndex(item => item.dealId === dealData.id);

            if (itemIndex === -1) {
                // Create wishlist item with only defined fields
                const wishlistItem = {
                    dealId: dealData.id,
                    createdAt: new Date()
                };

                // Add fields only if they are defined
                if (dealData.title) wishlistItem.title = dealData.title;
                if (dealData.description) wishlistItem.description = dealData.description;
                if (dealData.imageUrl) wishlistItem.imageUrl = dealData.imageUrl;
                if (dealData.originalPrice) wishlistItem.originalPrice = dealData.originalPrice;
                if (dealData.discountedPrice) wishlistItem.discountedPrice = dealData.discountedPrice;
                if (dealData.discountType) wishlistItem.discountType = dealData.discountType;
                if (dealData.retailerName) wishlistItem.retailerName = dealData.retailerName;
                if (dealData.category) wishlistItem.category = dealData.category;
                if (dealData.brand) wishlistItem.brand = dealData.brand;

                // Add to wishlist array
                userData.wishlist.push(wishlistItem);
                
                // Save to database
                if (!userDoc.exists()) {
                    await setDoc(userRef, userData);
                } else {
                    await updateDoc(userRef, {
                        wishlist: userData.wishlist
                    });
                }
                
                icon.classList.add('active');
                icon.style.color = '#ff6547';
            } else {
                // Remove from wishlist array
                userData.wishlist.splice(itemIndex, 1);
                await updateDoc(userRef, {
                    wishlist: userData.wishlist
                });
                icon.classList.remove('active');
                icon.style.color = '#666';
            }
        } catch (error) {
            console.error('Error toggling wishlist:', error);
            alert('Failed to update wishlist. Please try again.');
        }
    }

    // Make toggleWishlist available globally
    window.toggleWishlist = toggleWishlist;

    // Add these new functions for recommendations
    async function loadAllSections() {
        const userId = localStorage.getItem('loggedInUserId');
        
        // Load flash deals
        try {
            const flashResponse = await fetch('http://localhost:5000/flash-deals?num=3');
            const flashData = await flashResponse.json();
            if (flashData.success) {
                updateFlashSlider(flashData.deals);
            }
        } catch (error) {
            console.error('Error loading flash deals:', error);
        }

        // Load recommended deals
        try {
            const recommendedResponse = await fetch(`http://localhost:5000/recommendations/${userId}?num=3`);
            const recommendedData = await recommendedResponse.json();
            if (recommendedData.success) {
                updateDealsSection('recommendedDeals', recommendedData.recommendations);
            }
        } catch (error) {
            console.error('Error loading recommended deals:', error);
        }

        // Load suggested deals
        try {
            const suggestedResponse = await fetch(`http://localhost:5000/suggested-deals?user_id=${userId}&num=3`);
            const suggestedData = await suggestedResponse.json();
            if (suggestedData.success) {
                updateDealsSection('suggestedDeals', suggestedData.deals);
            }
        } catch (error) {
            console.error('Error loading suggested deals:', error);
        }

        // Load explore deals
        try {
            const exploreResponse = await fetch(`http://localhost:5000/explore-deals?user_id=${userId}&num=3`);
            const exploreData = await exploreResponse.json();
            if (exploreData.success) {
                updateDealsSection('exploreDeals', exploreData.deals);
            }
        } catch (error) {
            console.error('Error loading explore deals:', error);
        }
    }

    function updateFlashSlider(deals) {
        const slider = document.getElementById('flashSlider');
        const dots = document.getElementById('flashDots');
        
        slider.innerHTML = '';
        dots.innerHTML = '';
        
        deals.forEach((deal, index) => {
            // Add slide
            const slide = document.createElement('div');
            slide.className = `slide ${index === 0 ? 'active' : ''}`;
            slide.innerHTML = `
                <img src="${deal.imageUrl || 'default-image.jpg'}" alt="${deal.title}">
                <div class="slide-content">
                    <h3>${deal.title}</h3>
                    <p class="price">${deal.discountedPrice}</p>
                    <p class="discount">${deal.discountPercentage}% OFF</p>
                </div>
            `;
            slider.appendChild(slide);
            
            // Add dot
            const dot = document.createElement('span');
            dot.className = `dot ${index === 0 ? 'active' : ''}`;
            dots.appendChild(dot);
        });

        // Start slider animation
        startSlider();
    }

    function startSlider() {
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        const dots = document.querySelectorAll('.dot');
        
        function showSlide(index) {
            slides.forEach(slide => slide.classList.remove('active'));
            dots.forEach(dot => dot.classList.remove('active'));
            
            slides[index].classList.add('active');
            dots[index].classList.add('active');
        }
        
        function nextSlide() {
            currentSlide = (currentSlide + 1) % slides.length;
            showSlide(currentSlide);
        }
        
        // Change slide every 5 seconds
        setInterval(nextSlide, 5000);
    }

    function updateDealsSection(sectionId, deals) {
        const section = document.getElementById(sectionId);
        section.innerHTML = '';
        
        deals.forEach(deal => {
            const dealCard = document.createElement('div');
            dealCard.className = 'deal-card';
            dealCard.setAttribute('data-deal-id', deal.id);
            
            const imageUrl = deal.imageUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23cccccc'/%3E%3Ctext x='50%25' y='50%25' font-size='18' text-anchor='middle' alignment-baseline='middle' font-family='Arial, sans-serif' fill='%23666666'%3ENo Image%3C/text%3E%3C/svg%3E";
            
            let discountBadge = '';
            if (deal.discountType) {
                discountBadge = `<div class="discount-badge">${deal.discountType}</div>`;
            }
            
            const expiryDate = deal.expiryDate ? new Date(deal.expiryDate).toLocaleDateString() : 'No expiry';

            dealCard.innerHTML = `
                <img src="${imageUrl}" alt="${deal.title || 'Deal'}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'300\\' height=\\'200\\' viewBox=\\'0 0 300 200\\'%3E%3Crect width=\\'300\\' height=\\'200\\' fill=\\'%23cccccc\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' font-size=\\'18\\' text-anchor=\\'middle\\' alignment-baseline=\\'middle\\' font-family=\\'Arial, sans-serif\\' fill=\\'%23666666\\'%3ENo Image%3C/text%3E%3C/svg%3E'">
                ${discountBadge}
                <h4>${deal.title || 'Untitled Deal'}</h4>
                <p>${deal.description ? (deal.description.substring(0, 50) + (deal.description.length > 50 ? '...' : '')) : 'No description available'}</p>
                <div class="shop-info">
                    <strong>Shop:</strong> ${deal.retailerName || 'Unknown'}<br>
                    <strong>Expires:</strong> ${expiryDate}
                </div>
            `;

            dealCard.addEventListener('click', () => {
                window.showDealDetails(deal);
            });

            section.appendChild(dealCard);
        });
    }

    // Update the existing event listeners
    document.addEventListener('DOMContentLoaded', () => {
        // Load all sections
        loadAllSections();
        
        // Initialize search functionality
        initializeSearch();
        
        // Check authentication state
        checkAuthState();
    });

    // Add event listeners for data changes
    window.addEventListener('userDataChanged', () => {
        loadAllSections();
    });

    document.addEventListener('wishlistUpdated', () => {
        loadAllSections();
    });
});
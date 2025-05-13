import os
import firebase_admin
from firebase_admin import credentials, firestore
from google import generativeai as genai
import torch
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
from sentence_transformers import SentenceTransformer
import numpy as np
import requests

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize chatbot-specific recommendation model
chatbot_model = SentenceTransformer('all-MiniLM-L6-v2')

# System prompt for the chatbot's personality and behavior
system_prompt = """### ✅ FINAL AI SYSTEM PROMPT – DEAL DISCOVERY CHATBOT (PUDUCHERRY-FOCUSED)

You are a smart AI chatbot for an AI-powered **in-store deal discovery & navigation** app. You help users find deals based on location, preferences, and past behavior.

### 🛍 DEAL RESPONSE RULES

- Respond in a clean **DEAL CARD format** for each product:
  - **Product Name**
  - **Store Name & Location**
  - **Price** – Show only **if it exists**.
  - **Offer/Discount Details**
  - **Expiry Date** (optional)
  - **Description** (optional)
  - **Image URL**
- Display **up to 5 matching deal cards per request**.
- Do **not** mention unavailable fields like `"Price: N/A"`, stock info, or placeholder text.
- Always end with:  
  **"📍 Want directions? Let me know which store you'd like to visit!"**

---

### 🎯 PERSONALIZED RECOMMENDATIONS

- Use the user's past searches to prioritize certain deal categories (e.g., smartphones, shoes).
- This can be powered by a model like `intfloat/e5-small-v2` behind the scenes.

---

### 🎤 VOICE-BASED QUERY HANDLING

- Accept voice input (converted to text).
- If unclear, reply:  
  *"I didn't catch that. Could you say it again?"*
- After voice-based searches, optionally ask:  
  *"Want me to read the top deal out loud?"*

---

### 🗺 NAVIGATION TRIGGERS

Only respond with navigation when the user **explicitly** asks:

If user asks:
- *"Navigate to Vasanth & Co"*
- *"Show route to Poorvika store"*

navigating to "Vasanth & Co, MG Road, Puducherry"

If multiple store routes needed:

navigating to 
    "Poorvika, MG Road, Puducherry",
    "Vasanth & Co, Mission Street, Puducherry"

---

### 🚫 DO NOT

- Do not give casual, off-topic replies.
- Do not include stock availability or placeholder fields.
- Do not mention any stores or cities **outside Puducherry**.
- Do not generate responses unless the data is available (e.g., don't fake price/discount).
"""

# ========== 🔑 CONFIGURATION ==========
GEMINI_API_KEY = "AIzaSyDxlTjSKEagkUYOIrePKn8jBf0Qvj3oLaM"  # Your Gemini API key

# Configure Gemini API
genai.configure(api_key=GEMINI_API_KEY)
try:
    # Try the latest model versions in order
    model_versions = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro']
    model = None
    
    for version in model_versions:
        try:
            model = genai.GenerativeModel(version)
            # Test the model with a simple prompt
            response = model.generate_content("Hello")
            print(f"Successfully initialized Gemini model: {version}")
            break
        except Exception as e:
            print(f"Failed to initialize {version}: {str(e)}")
            continue
    
    if model is None:
        raise Exception("No working Gemini model found")
        
except Exception as e:
    print(f"Error initializing Gemini model: {e}")
    # Create a simple fallback model that returns a basic response
    class FallbackModel:
        def generate_content(self, prompt):
            return type('Response', (), {'text': "I'm currently experiencing technical difficulties. Please try again later."})()
    model = FallbackModel()
    print("Using fallback response model")

# Firebase DB1 (Deals)
cred1 = credentials.Certificate("dealdb.json")
app1 = firebase_admin.initialize_app(cred1, name='deals-db')
db1 = firestore.client(app=app1)

# Firebase DB2 (Users)
cred2 = credentials.Certificate("logindb.json")
app2 = firebase_admin.initialize_app(cred2, name='users-db')
db2 = firestore.client(app=app2)

# ========== 🧠 LOAD USER DATA ==========
def load_user_data(user_id):
    try:
        user_doc = db2.collection("users").document(user_id).get()
        if not user_doc.exists:
            return None
        user = user_doc.to_dict()
        preferences = user.get("preferences", {})
        history = user.get("searchHistory", [])
        wishlist = user.get("wishlist", [])
        return {
            "categories": preferences.get("categories", []),
            "stores": preferences.get("stores", []),
            "search_history": history,
            "wishlist": wishlist,
        }
    except Exception as e:
        print(f"Error loading user data: {e}")
        return None

# ========== 🔍 LOAD DEALS ==========
def load_deals():
    try:
        deals_ref = db1.collection("deals")
        snapshot = deals_ref.stream()
        deals = []
        for doc in snapshot:
            deal = doc.to_dict()
            # Add document ID to the deal data
            deal['id'] = doc.id
            # Only filter out inactive deals
            if deal.get("status", "active").lower() == "active":
                deals.append(deal)
        print(f"Loaded {len(deals)} active deals from database")
        return deals
    except Exception as e:
        print(f"Error loading deals: {e}")
        return []

# ========== 🧠 RANK DEALS ==========
def rank_deals_with_model(user_data, all_deals):
    try:
        # Create search query from user data
        search_terms = []
        
        # Add current query to search terms
        if user_data.get("search_history") and len(user_data["search_history"]) > 0:
            current_query = user_data["search_history"][-1].lower()
            search_terms.append(current_query)
            
            # Extract key terms from the query
            # Remove common words and keep important keywords
            common_words = ['show', 'me', 'find', 'search', 'look', 'for', 'deals', 'on', 'in', 'at', 'near', 'around', 'please', 'can', 'you', 'help', 'i', 'want', 'need', 'looking']
            query_words = [word for word in current_query.split() if word.lower() not in common_words]
            search_terms.extend(query_words)
            
            # Add synonyms for common search terms
            synonyms = {
                'flat': ['apartment', 'condo', 'residence', 'home', 'house', 'property', 'real estate'],
                'saree': ['sari', 'sarees', 'traditional', 'indian', 'wear', 'clothing', 'ethnic'],
                'phone': ['smartphone', 'mobile', 'cell', 'device', 'handset'],
                'laptop': ['computer', 'notebook', 'pc', 'desktop'],
                'tv': ['television', 'smart tv', 'led', 'lcd'],
                'fridge': ['refrigerator', 'cooler', 'freezer'],
                'ac': ['air conditioner', 'cooling', 'aircon'],
                'watch': ['timepiece', 'wristwatch', 'smartwatch'],
                'shoes': ['footwear', 'sneakers', 'boots', 'sandals'],
                'clothes': ['clothing', 'apparel', 'garments', 'fashion'],
                'food': ['restaurant', 'dining', 'meal', 'cuisine', 'eatery'],
                'electronics': ['gadgets', 'devices', 'tech', 'technology'],
                'furniture': ['home decor', 'interior', 'household', 'furnishings'],
                'beauty': ['cosmetics', 'makeup', 'skincare', 'personal care'],
                'books': ['literature', 'reading', 'publications', 'educational'],
                'sports': ['fitness', 'athletic', 'exercise', 'outdoor'],
                'toys': ['games', 'entertainment', 'children', 'kids'],
                'health': ['medical', 'wellness', 'pharmacy', 'healthcare']
            }
            
            # Add synonyms for each keyword in the query
            for word in query_words:
                for key, value in synonyms.items():
                    if word.lower() in [key] + value:
                        search_terms.extend([key] + value)
        
        # Add user preferences to search terms
        if user_data.get("categories"):
            search_terms.extend(user_data["categories"])
        
        # Create a comprehensive search query
        query = " ".join(search_terms)
        print(f"Search query: {query}")
        
        if not query.strip():
            print("No search history, returning recent deals")
            # Sort by creation date if no search history
            return sorted(all_deals, 
                        key=lambda x: x.get('createdAt', ''), 
                        reverse=True)[:5]

        # Get query embedding using chatbot model
        query_embedding = chatbot_model.encode(query)
        
        deal_scores = []
        
        for deal in all_deals:
            # Create deal text from all relevant fields
            deal_text = " ".join([
                deal.get('title', ''),
                deal.get('description', ''),
                deal.get('category', ''),
                deal.get('retailerName', ''),
                deal.get('discountType', ''),
                deal.get('keywords', '')  # Add any keywords field if available
            ])
            
            # Check for direct keyword matches
            direct_match_score = 0
            for term in search_terms:
                if term.lower() in deal_text.lower():
                    direct_match_score += 1
            
            # Get semantic similarity score using chatbot model
            deal_embedding = chatbot_model.encode(deal_text)
            similarity_score = np.dot(query_embedding, deal_embedding) / (np.linalg.norm(query_embedding) * np.linalg.norm(deal_embedding))
            
            # Combine direct match score with semantic similarity
            # Direct matches are weighted more heavily
            combined_score = (direct_match_score * 0.7) + (similarity_score * 0.3)
            
            deal_scores.append((combined_score, deal))

        # Sort deals by combined score
        deal_scores.sort(reverse=True, key=lambda x: x[0])
        
        # Filter out deals with very low scores (likely irrelevant)
        filtered_deals = [deal for score, deal in deal_scores if score > 0.1][:5]
        
        print(f"Found {len(filtered_deals)} matching deals")
        return filtered_deals
    except Exception as e:
        print(f"Error ranking deals: {e}")
        # Return recent deals as fallback
        return sorted(all_deals, 
                    key=lambda x: x.get('createdAt', ''), 
                    reverse=True)[:5]

# ========== 🎴 BUILD DEAL CARD ==========
def build_deal_card(deal):
    try:
        # Format dates
        expiry_date = None
        if deal.get('expiryDate') and deal.get('expiryDate') != 'No expiry':
            try:
                expiry_date = datetime.strptime(deal.get('expiryDate'), '%Y-%m-%d').strftime('%d %b %Y')
            except:
                pass

        # Format prices - only include if they exist
        price_section = ""
        if deal.get('originalPrice') or deal.get('discountedPrice'):
            original_price = f"₹{deal.get('originalPrice', '')}" if deal.get('originalPrice') else ''
            discounted_price = f"₹{deal.get('discountedPrice', '')}" if deal.get('discountedPrice') else ''
            
            if original_price and discounted_price:
                try:
                    original = float(str(deal['originalPrice']).replace('₹', '').replace(',', '').strip())
                    discounted = float(str(deal['discountedPrice']).replace('₹', '').replace(',', '').strip())
                    if original > 0:
                        discount_percentage = round(((original - discounted) / original) * 100)
                        price_section = f"""
                        <div class="price-info">
                            <span class="discounted-price">{discounted_price}</span>
                            <span class="original-price">{original_price}</span>
                            <span class="discount-percent">{discount_percentage}% OFF</span>
                        </div>"""
                except:
                    price_section = f"""
                    <div class="price-info">
                        <span class="discounted-price">{discounted_price}</span>
                    </div>"""
            elif discounted_price:
                price_section = f"""
                <div class="price-info">
                    <span class="discounted-price">{discounted_price}</span>
                </div>"""

        # Create deal card HTML following system prompt format
        card = f"""<div class="discount-item" data-deal-id="{deal.get('id', '')}">
    <img src="{deal.get('imageUrl', '')}" alt="{deal.get('title', 'Deal')}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'300\\' height=\\'200\\' viewBox=\\'0 0 300 200\\'%3E%3Crect width=\\'300\\' height=\\'200\\' fill=\\'%23cccccc\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' font-size=\\'18\\' text-anchor=\\'middle\\' alignment-baseline=\\'middle\\' font-family=\\'Arial, sans-serif\\' fill=\\'%23666666\\'%3ENo Image%3C/text%3E%3C/svg%3E'">
    
    {f'<div class="discount-badge">{deal.get("discountType", "")}</div>' if deal.get("discountType") else ''}
    
    <h4>{deal.get('title', 'Untitled Deal')}</h4>
    
    <div class="shop-info">
        <strong>📍 {deal.get('retailerName', '')}</strong>
        {f'<br>{deal.get("location", "Puducherry")}' if deal.get('location') else '<br>Puducherry'}
    </div>
    
    {price_section if price_section else ''}
    
    {f'<p>{deal.get("description")}</p>' if deal.get('description') else ''}
    
    {f'<div class="expiry-info">⏰ Expires: {expiry_date}</div>' if expiry_date else ''}
    
    <div class="deal-actions">
        <button class="deal-button view" onclick="viewDealDetails(this)">
            <i class="fas fa-eye"></i> View Details
        </button>
    </div>
</div>"""
        return card
    except Exception as e:
        print(f"Error building deal card: {e}")
        return ""

# ========== 🤖 GENERATE RESPONSE ==========
def generate(user_input, user_id):
    try:
        # Check if this is a navigation request first
        if any(keyword in user_input.lower() for keyword in ["navigate to", "show route to", "directions to", "how to reach", "want directions"]):
            # Extract store name from the request
            store_name = user_input.lower()
            for keyword in ["navigate to", "show route to", "directions to", "how to reach", "want directions"]:
                store_name = store_name.replace(keyword, "").strip()
            return f"navigating to {store_name}, Puducherry"

        # Load user data
        user_data = load_user_data(user_id)
        if not user_data:
            return "I'm sorry, I couldn't find your profile. Please make sure you're logged in."
        
        # Add current query to search history
        if "search_history" not in user_data:
            user_data["search_history"] = []
        user_data["search_history"].append(user_input)
        
        # Update user's search history in database
        try:
            db2.collection("users").document(user_id).update({
                "searchHistory": user_data["search_history"]
            })
        except Exception as e:
            print(f"Error updating search history: {e}")
        
        # Load deals once and reuse
        all_deals = load_deals()
        if not all_deals:
            return "I'm sorry, I couldn't find any deals at the moment. Please try again later."
        
        # Use search history and NLP for intelligent ranking
        ranked_deals = rank_deals_with_model(user_data, all_deals)
        if not ranked_deals:
            return "I couldn't find any active deals matching your query. Try searching for something else!"
        
        # Limit to 4 deals as per system prompt
        ranked_deals = ranked_deals[:4]
        
        # Build deal cards
        deal_cards = []
        for deal in ranked_deals:
            card = build_deal_card(deal)
            if card:
                deal_cards.append(card)
        
        if not deal_cards:
            return "I found some deals but couldn't format them properly. Please try again!"
        
        # Create the prompt for the AI to generate follow-up suggestions
        follow_up_prompt = f"""Based on the user's query "{user_input}" and the following deals, generate 2-3 natural, contextually relevant follow-up suggestions that would help the user discover more deals or related information. The suggestions should be:
1. Specific to the deals shown
2. Natural and conversational
3. Helpful for deal discovery
4. Focused on Puducherry locations

Deals shown:
{chr(10).join([f"- {deal.get('title', '')} at {deal.get('retailerName', '')}" for deal in ranked_deals])}

Generate the suggestions in a natural, conversational tone, as if you're having a friendly chat with the user. Each suggestion should be a complete sentence that the user can directly use as their next query."""

        # Generate follow-up suggestions using the model
        follow_up_response = model.generate_content(follow_up_prompt)
        follow_up_suggestions = follow_up_response.text.strip().split('\n')
        
        # Wrap deal cards in a grid container and add directions prompt with AI-generated follow-up suggestions
        deals_html = f'''<div class="discount-items">{"".join(deal_cards)}</div>

<p style="text-align: center; margin-top: 20px; color: #666;">📍 Want directions? Let me know which store you'd like to visit!</p>

<div class="follow-up-suggestions" style="text-align: center; margin-top: 15px; color: #666;">
    {"<br>".join(follow_up_suggestions)}
</div>'''
        
        # Create the prompt for the AI, letting it use its NLP capabilities
        prompt = f"""{system_prompt}

The user asked: "{user_input}"

Create a natural, engaging response that:
1. Introduces the deals with an appropriate opening

Remember to:
- Keep the tone friendly and professional
- Focus on Puducherry locations
- Only mention available information
- Add proper spacing between sentences
- Do NOT include the deals in your response as they will be shown separately
- Do NOT include any direction prompts as they will be shown separately"""

        # Generate response using the model's NLP capabilities
        response = model.generate_content(prompt)
        
        # Return the AI response and deals HTML separately
        return f"{response.text}\n\n{deals_html}"
    except Exception as e:
        print(f"Error generating response: {e}")
        return "I'm sorry, I encountered an error while processing your request. Please try again."

def handle_navigation_request(store_name):
    """Handle navigation request and return coordinates for the map"""
    try:
        # Use OpenRouteService API to geocode the location
        api_key = "5b3ce3597851110001cf624875873fb6067949a9b27e61d567aaee17"
        
        # First try with the exact store name
        url = f"https://api.openrouteservice.org/geocode/search?api_key={api_key}&text={store_name}"
        
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            if data.get('features'):
                # Get the first result
                feature = data['features'][0]
                location = feature['geometry']['coordinates']
                properties = feature['properties']
                
                # Extract city and state from properties
                city = properties.get('city', '')
                state = properties.get('state', '')
                
                # Format the full location name
                full_location = store_name
                if city and city not in store_name.lower():
                    full_location += f", {city}"
                if state and state not in store_name.lower():
                    full_location += f", {state}"
                
                return {
                    'status': 'success',
                    'coordinates': [location[1], location[0]],  # Convert to [lat, lng]
                    'store_name': full_location
                }
        
        # If no results found, try with a broader search
        broader_search = f"{store_name}, India"
        url = f"https://api.openrouteservice.org/geocode/search?api_key={api_key}&text={broader_search}"
        
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            if data.get('features'):
                feature = data['features'][0]
                location = feature['geometry']['coordinates']
                properties = feature['properties']
                
                # Extract city and state from properties
                city = properties.get('city', '')
                state = properties.get('state', '')
                
                # Format the full location name
                full_location = store_name
                if city and city not in store_name.lower():
                    full_location += f", {city}"
                if state and state not in store_name.lower():
                    full_location += f", {state}"
                
                return {
                    'status': 'success',
                    'coordinates': [location[1], location[0]],  # Convert to [lat, lng]
                    'store_name': full_location
                }
        
        return {
            'status': 'error',
            'message': 'Location not found'
        }
    except Exception as e:
        print(f"Error in handle_navigation_request: {e}")
        return {
            'status': 'error',
            'message': str(e)
        }

@app.route('/navigate', methods=['POST'])
def navigate():
    try:
        # Enable CORS for this endpoint
        response_headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
        
        # Handle preflight request
        if request.method == 'OPTIONS':
            return ('', 204, response_headers)
            
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'No data provided'
            }), 400, response_headers
            
        store_name = data.get('store_name')
        if not store_name:
            return jsonify({
                'status': 'error',
                'message': 'Store name is required'
            }), 400, response_headers
            
        result = handle_navigation_request(store_name)
        return jsonify(result), 200, response_headers
        
    except Exception as e:
        print(f"Error in navigate endpoint: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500, response_headers

@app.route('/proxy', methods=['POST'])
def proxy():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        url = data.get('url')
        method = data.get('method', 'GET')
        headers = data.get('headers', {})
        params = data.get('params', {})

        if not url:
            return jsonify({'error': 'No URL provided'}), 400

        # Add OpenRouteService API key to headers
        headers['Authorization'] = '5b3ce3597851110001cf624875873fb6067949a9b27e61d567aaee17'

        # Make the request to OpenRouteService
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            timeout=10
        )

        # Check if the response is successful
        if response.status_code != 200:
            print(f"OpenRouteService API error: {response.status_code} - {response.text}")
            return jsonify({'error': f'OpenRouteService API error: {response.status_code}'}), response.status_code

        # Return the response from OpenRouteService
        return response.json(), 200

    except requests.exceptions.Timeout:
        print("Request to OpenRouteService timed out")
        return jsonify({'error': 'Request timed out'}), 504
    except requests.exceptions.RequestException as e:
        print(f"Error in proxy endpoint: {e}")
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        print(f"Unexpected error in proxy endpoint: {e}")
        return jsonify({'error': str(e)}), 500

# ========== 🌐 FLASK ROUTES ==========
@app.route('/')
def serve_chatbot():
    return send_from_directory('.', 'chatbot.html')

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        if not data:
            print("Error: No JSON data received")
            return jsonify({"error": "No JSON data provided"}), 400
            
        user_input = data.get('message', '')
        user_id = data.get('userId', '')
        
        print(f"Received request - User ID: {user_id}, Message: {user_input}")
        
        if not user_input:
            print("Error: No message provided")
            return jsonify({"error": "No message provided"}), 400
        
        if not user_id:
            print("Error: No user ID provided")
            return jsonify({"error": "No user ID provided"}), 400
        
        response = generate(user_input, user_id)
        return jsonify({"response": response})
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/flash-deals')
def get_flash_deals():
    try:
        num = request.args.get('num', default=4, type=int)
        deals = load_deals()
        # Sort by creation date to get latest deals
        flash_deals = sorted(deals, key=lambda x: x.get('createdAt', ''), reverse=True)[:num]
        return jsonify([build_deal_card(deal) for deal in flash_deals])
    except Exception as e:
        print(f"Error getting flash deals: {e}")
        return jsonify([])

@app.route('/recommendations/<user_id>')
def get_recommendations(user_id):
    try:
        num = request.args.get('num', default=4, type=int)
        user_data = load_user_data(user_id)
        if not user_data:
            return jsonify([])
        
        all_deals = load_deals()
        recommended_deals = rank_deals_with_model(user_data, all_deals)[:num]
        return jsonify([build_deal_card(deal) for deal in recommended_deals])
    except Exception as e:
        print(f"Error getting recommendations: {e}")
        return jsonify([])

@app.route('/suggested-deals')
def get_suggested_deals():
    try:
        user_id = request.args.get('user_id')
        num = request.args.get('num', default=4, type=int)
        
        if not user_id:
            return jsonify([])
            
        user_data = load_user_data(user_id)
        if not user_data:
            return jsonify([])
            
        all_deals = load_deals()
        # Get deals based on user's search history and preferences
        suggested_deals = rank_deals_with_model(user_data, all_deals)[:num]
        return jsonify([build_deal_card(deal) for deal in suggested_deals])
    except Exception as e:
        print(f"Error getting suggested deals: {e}")
        return jsonify([])

@app.route('/explore-deals')
def get_explore_deals():
    try:
        user_id = request.args.get('user_id')
        num = request.args.get('num', default=4, type=int)
        
        all_deals = load_deals()
        if user_id:
            user_data = load_user_data(user_id)
            if user_data:
                # Get personalized deals if user data exists
                deals = rank_deals_with_model(user_data, all_deals)
            else:
                # Fallback to recent deals if no user data
                deals = sorted(all_deals, key=lambda x: x.get('createdAt', ''), reverse=True)
        else:
            # Get recent deals if no user ID
            deals = sorted(all_deals, key=lambda x: x.get('createdAt', ''), reverse=True)
            
        return jsonify([build_deal_card(deal) for deal in deals[:num]])
    except Exception as e:
        print(f"Error getting explore deals: {e}")
        return jsonify([])

@app.route('/deals')
def get_deals():
    try:
        retailer = request.args.get('retailer')
        if not retailer:
            return jsonify([]), 400

        # Query deals from the database
        deals_ref = db1.collection("deals")
        query = deals_ref.where("retailerName", "==", retailer).where("status", "==", "active")
        snapshot = query.stream()
        
        deals = []
        for doc in snapshot:
            deal = doc.to_dict()
            # Add document ID to the deal data
            deal['id'] = doc.id
            # Ensure all required fields for map markers are present
            if not deal.get('imageUrl'):
                deal['imageUrl'] = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'200\' viewBox=\'0 0 300 200\'%3E%3Crect width=\'300\' height=\'200\' fill=\'%23cccccc\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' font-size=\'18\' text-anchor=\'middle\' alignment-baseline=\'middle\' font-family=\'Arial, sans-serif\' fill=\'%23666666\'%3ENo Image%3C/text%3E%3C/svg%3E'
            if not deal.get('discountType'):
                deal['discountType'] = 'Deal'
            if not deal.get('expiryDate'):
                deal['expiryDate'] = 'No expiry'
            deals.append(deal)
            
        return jsonify(deals), 200
    except Exception as e:
        print(f"Error fetching deals: {e}")
        return jsonify([]), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000) 



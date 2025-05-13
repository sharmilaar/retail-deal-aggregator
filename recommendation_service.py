import torch
from transformers import AutoTokenizer, AutoModel
import firebase_admin
from firebase_admin import credentials, firestore
import numpy as np
from typing import List, Dict
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
import random

# Initialize Firebase Admin for users
cred1 = credentials.Certificate("login firebase.json")
user_app = firebase_admin.initialize_app(cred1, name='recommendation-user-app')

# Initialize Firebase Admin for deals
cred2 = credentials.Certificate("deals firebase.json")
deals_app = firebase_admin.initialize_app(cred2, name='recommendation-deals-app')

class RecommendationService:
    def __init__(self):
        """Initialize the recommendation service with the E5 model"""
        print("Loading AI model...")
        self.tokenizer = AutoTokenizer.from_pretrained('intfloat/e5-small-v2')
        self.model = AutoModel.from_pretrained('intfloat/e5-small-v2')
        print("AI model loaded successfully!")
        
    def get_embedding(self, text: str) -> np.ndarray:
        """Convert text to numerical vectors using the E5 model"""
        # Add prefix for better performance as recommended by E5 model
        text = f"passage: {text}"
        inputs = self.tokenizer(text, padding=True, truncation=True, return_tensors='pt')
        
        # Generate embeddings
        with torch.no_grad():
            outputs = self.model(**inputs)
            embeddings = outputs.last_hidden_state[:, 0, :]  # Use [CLS] token embedding
            # Normalize embeddings
            embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)
            
        return embeddings[0].numpy()
    
    def get_user_profile(self, user_id: str) -> Dict:
        """
        Fetch user's profile from Firebase
        Includes:
        - Search history
        - Wishlist items
        - Chat history
        """
        print(f"Fetching profile for user: {user_id}")
        user_ref = firestore.client(app=user_app).collection('users').document(user_id)
        user_data = user_ref.get().to_dict()
        
        if not user_data:
            print("No user data found, returning empty profile")
            return {"search_history": [], "wishlist": [], "chat_history": []}
            
        profile = {
            "search_history": user_data.get("searchHistory", []),
            "wishlist": user_data.get("wishlist", []),
            "chat_history": user_data.get("chatHistory", [])
        }
        print(f"Found {len(profile['search_history'])} search items and {len(profile['wishlist'])} wishlist items")
        return profile
    
    def get_all_deals(self) -> List[Dict]:
        """Fetch all active deals from Firebase"""
        print("Fetching active deals...")
        deals_ref = firestore.client(app=deals_app).collection('deals')
        deals = deals_ref.where("status", "==", "active").stream()
        deals_list = [{"id": deal.id, **deal.to_dict()} for deal in deals]
        print(f"Found {len(deals_list)} active deals")
        return deals_list
    
    def create_user_embedding(self, user_profile: Dict) -> np.ndarray:
        """
        Create an embedding representing user's interests
        Combines:
        - Search history
        - Wishlist item titles
        - Wishlist item descriptions
        - Wishlist item categories
        """
        print("Creating user interest embedding...")
        texts = []
        
        # Add search history
        texts.extend(user_profile["search_history"])
        print(f"Added {len(user_profile['search_history'])} search terms")
        
        # Add wishlist items' details
        for item in user_profile["wishlist"]:
            if "title" in item:
                texts.append(item["title"])
            if "description" in item:
                texts.append(item["description"])
            if "category" in item:
                texts.append(item["category"])
        
        if not texts:
            print("No user data available for embedding")
            return None
            
        print(f"Created embedding from {len(texts)} text items")
        combined_text = " ".join(texts)
        return self.get_embedding(combined_text)
    
    def get_deal_embedding(self, deal: Dict) -> np.ndarray:
        """
        Create embedding for a deal using:
        - Title
        - Description
        - Category
        """
        texts = []
        
        if "title" in deal:
            texts.append(deal["title"])
        if "description" in deal:
            texts.append(deal["description"])
        if "category" in deal:
            texts.append(deal["category"])
            
        combined_text = " ".join(texts)
        return self.get_embedding(combined_text)
    
    def compute_similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """Calculate how similar two embeddings are using cosine similarity"""
        return np.dot(embedding1, embedding2) / (np.linalg.norm(embedding1) * np.linalg.norm(embedding2))
    
    def get_recommendations(self, user_id: str, num_recommendations: int = 4) -> List[Dict]:
        """Generate personalized deal recommendations for a user"""
        try:
            print(f"Generating recommendations for user: {user_id}")
            user_profile = self.get_user_profile(user_id)
            all_deals = self.get_all_deals()
            
            # Filter active deals
            active_deals = [deal for deal in all_deals if deal.get('status', '').lower() == 'active']
            
            # Get user embedding
            user_embedding = self.create_user_embedding(user_profile)
            if user_embedding is None:
                print("No user data, returning random active deals")
                return self.format_deals(active_deals[:num_recommendations])
            
            # Calculate similarity scores
            print("Calculating deal similarities...")
            deal_scores = []
            for deal in active_deals:
                deal_embedding = self.get_deal_embedding(deal)
                similarity = self.compute_similarity(user_embedding, deal_embedding)
                deal_scores.append((deal, similarity))
            
            # Sort deals by similarity score
            deal_scores.sort(key=lambda x: x[1], reverse=True)
            
            # Format and return top N recommendations
            recommendations = [deal for deal, _ in deal_scores[:num_recommendations]]
            formatted_recommendations = self.format_deals(recommendations)
            print(f"Generated {len(formatted_recommendations)} recommendations")
            return formatted_recommendations
            
        except Exception as e:
            print(f"Error generating recommendations: {str(e)}")
            return []
    
    def format_deals(self, deals: List[Dict]) -> List[Dict]:
        """Format deals with proper price handling and required fields"""
        formatted_deals = []
        for deal in deals:
            formatted_deal = {
                'id': str(deal.get('id', '')),
                'title': str(deal.get('title', 'Untitled Deal')),
                'description': str(deal.get('description', 'No description available')),
                'imageUrl': str(deal.get('imageUrl', '')),
                'retailerName': str(deal.get('retailerName', 'Unknown Retailer')),
                'category': str(deal.get('category', 'General')),
                'createdAt': deal.get('createdAt', ''),
                'expiryDate': deal.get('expiryDate', ''),
                'discountType': str(deal.get('discountType', '')),
            }
            
            # Handle price formatting
            try:
                original_price = deal.get('originalPrice', '')
                discounted_price = deal.get('discountedPrice', '')
                
                # Ensure prices are properly formatted with ₹ symbol
                if original_price:
                    formatted_deal['originalPrice'] = f"₹{str(original_price).replace('₹', '').strip()}"
                if discounted_price:
                    formatted_deal['discountedPrice'] = f"₹{str(discounted_price).replace('₹', '').strip()}"
                
                # Calculate discount percentage if both prices are available
                if original_price and discounted_price:
                    try:
                        original = float(str(original_price).replace('₹', '').replace(',', '').strip())
                        discounted = float(str(discounted_price).replace('₹', '').replace(',', '').strip())
                        if original > 0:
                            discount = ((original - discounted) / original) * 100
                            formatted_deal['discountPercentage'] = round(discount)
                    except (ValueError, TypeError):
                        formatted_deal['discountPercentage'] = 0
            except Exception as e:
                print(f"Error formatting prices for deal: {e}")
            
            formatted_deals.append(formatted_deal)
        
        return formatted_deals
    
    def get_chat_recommendations(self, query: str, num_recommendations: int = 5) -> List[Dict]:
        """Get recommendations based on chat query"""
        print(f"Generating chat recommendations for query: {query}")
        all_deals = self.get_all_deals()
        
        # Create embedding for the query
        query_embedding = self.get_embedding(query)
        
        # Calculate similarity scores
        deal_scores = []
        for deal in all_deals:
            deal_embedding = self.get_deal_embedding(deal)
            similarity = self.compute_similarity(query_embedding, deal_embedding)
            deal_scores.append((deal, similarity))
        
        # Sort and return top matches
        deal_scores.sort(key=lambda x: x[1], reverse=True)
        return [deal for deal, _ in deal_scores[:num_recommendations]]
    
    def get_homepage_recommendations(self, user_id: str = None, num_recommendations: int = 10) -> List[Dict]:
        """Get recommendations for homepage"""
        if user_id:
            # Personalized recommendations if user is logged in
            return self.get_recommendations(user_id, num_recommendations)
        else:
            # Popular deals for non-logged in users
            all_deals = self.get_all_deals()
            # Sort by popularity (assuming there's a 'views' or 'popularity' field)
            return sorted(all_deals, key=lambda x: x.get('views', 0), reverse=True)[:num_recommendations]

    def get_flash_deals(self, num_deals: int = 4) -> List[Dict]:
        """Get random flash deals"""
        try:
            print("Fetching flash deals...")
            all_deals = self.get_all_deals()
            
            # Filter active deals
            active_deals = [deal for deal in all_deals if deal.get('status', '').lower() == 'active']
            
            # Randomly shuffle the deals
            random.shuffle(active_deals)
            
            # Take the first num_deals
            selected_deals = active_deals[:num_deals]
            
            # Format the deals with proper price handling
            formatted_deals = []
            for deal in selected_deals:
                formatted_deal = {
                    'id': str(deal.get('id', '')),
                    'title': str(deal.get('title', 'Untitled Deal')),
                    'description': str(deal.get('description', 'No description available')),
                    'imageUrl': str(deal.get('imageUrl', '')),
                    'retailerName': str(deal.get('retailerName', 'Unknown Retailer')),
                    'category': str(deal.get('category', 'General')),
                    'createdAt': deal.get('createdAt', ''),
                    'expiryDate': deal.get('expiryDate', ''),
                }
                
                # Handle price formatting
                try:
                    original_price = deal.get('originalPrice', '')
                    discounted_price = deal.get('discountedPrice', '')
                    
                    # Ensure prices are properly formatted with ₹ symbol
                    if original_price:
                        formatted_deal['originalPrice'] = f"₹{str(original_price).replace('₹', '').strip()}"
                    if discounted_price:
                        formatted_deal['discountedPrice'] = f"₹{str(discounted_price).replace('₹', '').strip()}"
                    
                    # Calculate discount percentage if both prices are available
                    if original_price and discounted_price:
                        try:
                            original = float(str(original_price).replace('₹', '').replace(',', '').strip())
                            discounted = float(str(discounted_price).replace('₹', '').replace(',', '').strip())
                            if original > 0:
                                discount = ((original - discounted) / original) * 100
                                formatted_deal['discountPercentage'] = round(discount)
                        except (ValueError, TypeError):
                            formatted_deal['discountPercentage'] = 0
                except Exception as e:
                    print(f"Error formatting prices for deal: {e}")
                
                formatted_deals.append(formatted_deal)
            
            print(f"Returning {len(formatted_deals)} formatted flash deals")
            return formatted_deals
            
        except Exception as e:
            print(f"Error fetching flash deals: {str(e)}")
            return []

    def get_explore_deals(self, user_id: str = None, num_deals: int = 4) -> List[Dict]:
        """Get deals based on user's interests and trending items"""
        try:
            if user_id:
                return self.get_recommendations(user_id, num_deals)
            else:
                # Get trending deals
                all_deals = self.get_all_deals()
                active_deals = [deal for deal in all_deals if deal.get('status', '').lower() == 'active']
                sorted_deals = sorted(
                    active_deals,
                    key=lambda x: x.get('views', 0),
                    reverse=True
                )[:num_deals]
                return self.format_deals(sorted_deals)
        except Exception as e:
            print(f"Error getting explore deals: {str(e)}")
            return []

    def get_suggested_deals(self, user_id: str = None, num_deals: int = 4) -> List[Dict]:
        """Get deals based on user's recent interactions"""
        try:
            if user_id:
                user_profile = self.get_user_profile(user_id)
                # Get deals similar to recently viewed items
                recent_items = user_profile.get('recentlyViewed', [])
                if recent_items:
                    return self.get_recommendations(user_id, num_deals)
            
            # Fallback to popular deals
            all_deals = self.get_all_deals()
            active_deals = [deal for deal in all_deals if deal.get('status', '').lower() == 'active']
            sorted_deals = sorted(
                active_deals,
                key=lambda x: x.get('popularity', 0),
                reverse=True
            )[:num_deals]
            return self.format_deals(sorted_deals)
        except Exception as e:
            print(f"Error getting suggested deals: {str(e)}")
            return []

# Create Flask app
app = Flask(__name__)
CORS(app)

# Initialize recommendation service
print("Initializing recommendation service...")
recommendation_service = RecommendationService()
print("Recommendation service initialized!")

@app.route('/recommendations/<user_id>', methods=['GET'])
def get_recommendations(user_id):
    """API endpoint to get recommendations for a user"""
    try:
        print(f"Received recommendation request for user: {user_id}")
        num_recommendations = int(request.args.get('num', 4))
        recommendations = recommendation_service.get_recommendations(user_id, num_recommendations)
        print(f"Successfully generated {len(recommendations)} recommendations")
        return jsonify({
            "success": True,
            "recommendations": recommendations
        })
    except Exception as e:
        print(f"Error generating recommendations: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/chat/recommendations', methods=['POST'])
def get_chat_recommendations():
    """API endpoint for chatbot recommendations"""
    try:
        data = request.get_json()
        query = data.get('query')
        num_recommendations = int(data.get('num', 5))
        
        recommendations = recommendation_service.get_chat_recommendations(query, num_recommendations)
        return jsonify({
            "success": True,
            "recommendations": recommendations
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/homepage/recommendations', methods=['GET'])
def get_homepage_recommendations():
    """API endpoint for homepage recommendations"""
    try:
        user_id = request.args.get('user_id')
        num_recommendations = int(request.args.get('num', 10))
        
        recommendations = recommendation_service.get_homepage_recommendations(user_id, num_recommendations)
        return jsonify({
            "success": True,
            "recommendations": recommendations
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/flash-deals', methods=['GET'])
def get_flash_deals():
    """API endpoint for flash deals"""
    try:
        num_deals = int(request.args.get('num', 4))
        deals = recommendation_service.get_flash_deals(num_deals)
        return jsonify({
            "success": True,
            "deals": deals
        })
    except Exception as e:
        print(f"Error in flash-deals endpoint: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/explore-deals', methods=['GET'])
def get_explore_deals():
    """API endpoint for explore deals"""
    try:
        user_id = request.args.get('user_id')
        num_deals = int(request.args.get('num', 4))
        deals = recommendation_service.get_explore_deals(user_id, num_deals)
        return jsonify({
            "success": True,
            "deals": deals
        })
    except Exception as e:
        print(f"Error in explore-deals endpoint: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/suggested-deals', methods=['GET'])
def get_suggested_deals():
    """API endpoint for suggested deals"""
    try:
        user_id = request.args.get('user_id')
        num_deals = int(request.args.get('num', 4))
        deals = recommendation_service.get_suggested_deals(user_id, num_deals)
        return jsonify({
            "success": True,
            "deals": deals
        })
    except Exception as e:
        print(f"Error in suggested-deals endpoint: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    print("Starting recommendation service on port 5001...")
    app.run(port=5001, debug=True) 
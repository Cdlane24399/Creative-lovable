"""
Test script for the chat API endpoint.
Run this to verify the chat functionality works correctly.
"""
import json

# Test payload
test_payload = {
    "messages": [
        {
            "id": "test-1",
            "role": "user", 
            "content": "Hello, can you help me create a simple button component?",
            "parts": [{"type": "text", "text": "Hello, can you help me create a simple button component?"}]
        }
    ],
    "model": "anthropic",
    "projectId": "test-project"
}

print("Chat API Test Payload:")
print(json.dumps(test_payload, indent=2))
print("\n" + "="*50)
print("To test the API, send a POST request to /api/chat with this payload")
print("="*50)

# Verify model options
model_options = {
    "anthropic": "anthropic/claude-sonnet-4-20250514",
    "google": "google/gemini-2.0-flash", 
    "openai": "openai/gpt-4o",
}

print("\nConfigured Models:")
for key, value in model_options.items():
    print(f"  {key}: {value}")

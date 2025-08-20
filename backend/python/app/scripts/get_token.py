#!/usr/bin/env python3
"""
Simple script to get Google Drive tokens from Pipeshub services
"""

import os
import requests
import json

# Your IDs from env_vars.txt
ORG_ID = "68a2027a85f741b6432df35b"
USER_ID = "68a2027a85f741b6432df35c"

# Pipeshub endpoints
NODEJS_ENDPOINT = "http://localhost:3000"
CREDENTIALS_ENDPOINT = f"{NODEJS_ENDPOINT}/api/v1/configurationManager/internal/connectors/individual/googleWorkspaceCredentials"


def create_jwt_token():
    """Create a simple JWT token for testing"""
    import jwt
    from datetime import datetime, timedelta

    # Payload matching your source code
    payload = {
        "userId": USER_ID,
        "orgId": ORG_ID,
        "scopes": ["fetch:config"],
        "exp": datetime.utcnow() + timedelta(hours=1),
    }

    # Use a test secret (you'll need the real one from your system)
    secret = "test-secret-key-for-debugging"

    return jwt.encode(payload, secret, algorithm="HS256")


def get_credentials():
    """Get Google Drive credentials from Pipeshub"""

    print("🔑 Getting Google Drive credentials...")
    print(f"   Org ID: {ORG_ID}")
    print(f"   User ID: {USER_ID}")
    print(f"   Endpoint: {CREDENTIALS_ENDPOINT}")

    # Create JWT token
    jwt_token = create_jwt_token()
    print(f"   JWT Token: {jwt_token}")

    # Headers
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Content-Type": "application/json",
    }

    # Payload
    payload = {"orgId": ORG_ID, "userId": USER_ID, "scopes": ["fetch:config"]}

    try:
        # Make request
        print("\n🌐 Making request to Pipeshub...")
        response = requests.post(CREDENTIALS_ENDPOINT, json=payload, headers=headers)

        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text}")

        if response.status_code == 200:
            creds = response.json()
            print("\n✅ Success! Got credentials:")
            print(f"   Access Token: {creds.get('access_token', 'N/A')[:50]}...")
            print(f"   Refresh Token: {creds.get('refresh_token', 'N/A')[:50]}...")
            print(f"   Expires: {creds.get('access_token_expiry_time', 'N/A')}")

            # Set environment variables
            os.environ["GOOGLE_ACCESS_TOKEN"] = creds.get("access_token", "")
            os.environ["GOOGLE_REFRESH_TOKEN"] = creds.get("refresh_token", "")

            print("\n🔧 Environment variables set!")
            print("   You can now run your test script")

        else:
            print(f"\n❌ Failed to get credentials: {response.status_code}")
            print(f"   Error: {response.text}")

    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        print("   Make sure Pipeshub Node.js service is running on port 3000")


if __name__ == "__main__":
    get_credentials()

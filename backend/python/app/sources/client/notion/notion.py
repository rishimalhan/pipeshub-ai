
import base64
import json
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional
from urllib.parse import urlencode

from app.config.configuration_service import ConfigurationService
from app.services.graph_db.interface.graph_db import IGraphService
from app.sources.client.http.http_client import HTTPClient
from app.sources.client.http.http_request import HTTPRequest
from app.sources.client.iclient import IClient


@dataclass
class NotionResponse:
    """Standardized Notion API response wrapper"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)

    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict())

class NotionRESTClientViaOAuth(HTTPClient):
    """Notion REST client via OAuth 2.0 - handles OAuth flow internally.
    If no access token provided, we'll need to go through OAuth flow
    Args:
        client_id: The OAuth client ID
        client_secret: The OAuth client secret
        redirect_uri: The redirect URI for OAuth flow
        access_token: Optional existing access token
        version: Notion API version (default: "2022-06-28")
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        access_token: Optional[str] = None,
        version: str = "2022-06-28"
    ) -> None:
        # Initialize with empty token first, will be set after OAuth flow
        super().__init__(access_token or "", "Bearer")

        self.base_url = "https://api.notion.com/v1"
        self.oauth_base_url = "https://api.notion.com/v1/oauth"
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.access_token = access_token
        self.version = version

        # Add Notion-specific headers
        self.headers.update({
            "Notion-Version": version,
            "Content-Type": "application/json"
        })

        # If no access token provided, we'll need to go through OAuth flow
        self._oauth_completed = access_token is not None

    def get_base_url(self) -> str:
        """Get the base URL"""
        return self.base_url

    def is_oauth_completed(self) -> bool:
        """Check if OAuth flow has been completed"""
        return self._oauth_completed

    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """Generate OAuth authorization URL (internal method)
        Args:
            state: Optional state parameter for security
        Returns:
            Authorization URL
        """
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "owner": "user",
            "redirect_uri": self.redirect_uri
        }

        if state:
            params["state"] = state

        return f"{self.oauth_base_url}/authorize?{urlencode(params)}"

    # TODO: Before using this method, implement a callback endpoint that can be used to handle the OAuth callback
    # the authorization code is received from the callback endpoint and then this method is called to complete the OAuth flow
    # and the token is returned
    async def initiate_oauth_flow(self, authorization_code: str) -> Optional[str]:
        """Complete OAuth flow with authorization code
        Args:
            authorization_code: The code received from OAuth callback
        Returns:
            Token data from OAuth exchange
        """
        return await self._exchange_code_for_token(authorization_code)

    async def refresh_token(self, refresh_token: str) -> Optional[str]:
        """Refresh OAuth access token
        Args:
            refresh_token: The refresh token from previous OAuth flow
        Returns:
            New token data
        """
        credentials = f"{self.client_id}:{self.client_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        headers = {
            "Authorization": f"Basic {encoded_credentials}",
            "Content-Type": "application/json",
            "Notion-Version": self.version
        }

        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token
        }

        request = HTTPRequest(
            method="POST",
            url=f"{self.oauth_base_url}/token",
            headers=headers,
            body=data
        )

        token_data: Dict[str, Any]
        async with HTTPClient(token="") as client:
            response = await client.execute(request)
            token_data = await response.json()
        self.access_token = token_data.get("access_token")

        # Update headers with new token
        if self.access_token:
            self.headers["Authorization"] = f"Bearer {self.access_token}"

        return token_data.get("access_token") if token_data.get("access_token") else None

    async def _exchange_code_for_token(self, code: str) -> Optional[str]:
        """Exchange authorization code for access token (internal method)
        Args:
            code: Authorization code from callback
        Returns:
            Token response containing access_token, token_type, etc.
        """
        # Encode client credentials for Basic auth
        credentials = f"{self.client_id}:{self.client_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        headers = {
            "Authorization": f"Basic {encoded_credentials}",
            "Content-Type": "application/json",
            "Notion-Version": self.version
        }

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.redirect_uri
        }

        request = HTTPRequest(
            method="POST",
            url=f"{self.oauth_base_url}/token",
            headers=headers,
            body=data
        )
        token_data: Dict[str, Any]
        async with HTTPClient(token="") as client:
            response = await client.execute(request)
            token_data = await response.json()
        token_data = await response.json()
        self.access_token = token_data.get("access_token")

        # Update headers with new token
        if self.access_token:
            self.headers["Authorization"] = f"Bearer {self.access_token}"
            self._oauth_completed = True

        return token_data.get("access_token") if token_data.get("access_token") else None


class NotionRESTClientViaToken(HTTPClient):
    """Notion REST client via Internal Integration token
    Args:
        token: The internal integration token to use for authentication
        version: Notion API version (default: "2022-06-28")
    """

    def __init__(self, token: str, version: str = "2022-06-28") -> None:
        super().__init__(token, "Bearer")
        self.base_url = "https://api.notion.com/v1"
        self.version = version
        self.headers.update({
            "Notion-Version": version,
            "Content-Type": "application/json"
        })

    def get_base_url(self) -> str:
        """Get the base URL"""
        return self.base_url

@dataclass
class NotionTokenConfig:
    """Configuration for Notion REST client via Internal Integration token
    Args:
        token: The internal integration token
        version: Notion API version
        ssl: Whether to use SSL (always True for Notion)
    """
    token: str
    version: str = "2022-06-28"
    ssl: bool = True

    def create_client(self) -> NotionRESTClientViaToken:
        return NotionRESTClientViaToken(self.token, self.version)

    def to_dict(self) -> dict:
        """Convert the configuration to a dictionary"""
        return asdict(self)


class NotionClient(IClient):
    """Builder class for Notion clients with different authentication methods"""

    def __init__(self, client: NotionRESTClientViaToken) -> None:
        """Initialize with a Notion client object"""
        self.client = client

    def get_client(self) -> NotionRESTClientViaToken:
        """Return the Notion client object"""
        return self.client

    @classmethod
    def build_with_config(cls, config: NotionTokenConfig) -> "NotionClient":
        """Build NotionClient with configuration
        Args:
            config: NotionTokenConfig instance
        Returns:
            NotionClient instance
        """
        return cls(config.create_client())

    @classmethod
    async def build_from_services(
        cls,
        logger,
        config_service: ConfigurationService,
        graph_db_service: IGraphService,
    ) -> "NotionClient":
        """Build NotionClient using configuration service and arango service
        Args:
            logger: Logger instance
            config_service: Configuration service instance
            graph_db_service: GraphDB service instance
        Returns:
            NotionClient instance
        """
        # TODO: Implement - fetch config from services
        # This would typically:
        # 1. Query graph_db_service for stored Notion credentials
        # 2. Use config_service to get environment-specific settings
        # 3. Return appropriate client based on available credentials

        return cls(client=None)  # type: ignore

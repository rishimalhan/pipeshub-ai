import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator, List

import uvicorn
from dependency_injector import providers
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.middlewares.auth import authMiddleware
from app.config.constants.arangodb import AccountType, Connectors
from app.connectors.api.router import router
from app.connectors.core.base.data_processor.data_source_entities_processor import (
    DataSourceEntitiesProcessor,
)
from app.connectors.sources.localKB.api.kb_router import kb_router
from app.connectors.sources.microsoft.common.apps import OneDriveApp
from app.connectors.sources.microsoft.onedrive.onedrive import (
    OneDriveConnector,
    OneDriveCredentials,
)
from app.containers.connector import (
    ConnectorAppContainer,
    initialize_container,
    initialize_enterprise_google_account_services_fn,
    initialize_individual_google_account_services_fn,
)
from app.services.messaging.kafka.utils.utils import KafkaUtils
from app.services.messaging.messaging_factory import MessagingFactory
from app.utils.time_conversion import get_epoch_timestamp_in_ms

container = ConnectorAppContainer.init("connector_service")

async def get_initialized_container() -> ConnectorAppContainer:
    """Dependency provider for initialized container"""
    # Create container instance
    if not hasattr(get_initialized_container, "_initialized"):
        await initialize_container(container)
        # Wire the container after initialization
        container.wire(
            modules=[
                "app.core.celery_app",
                "app.connectors.sources.google.common.sync_tasks",
                "app.connectors.api.router",
                "app.connectors.sources.localKB.api.kb_router",
                "app.connectors.api.middleware",
                "app.core.signed_url",
            ]
        )
        setattr(get_initialized_container, "_initialized", True)
    return container


async def resume_sync_services(app_container: ConnectorAppContainer) -> bool:
    """Resume sync services for users with active sync states"""
    logger = app_container.logger()
    logger.debug("🔄 Checking for sync services to resume")

    try:
        arango_service = await app_container.arango_service()  # type: ignore

        # Get all organizations
        orgs = await arango_service.get_all_orgs(active=True)
        if not orgs:
            logger.info("No organizations found in the system")
            return True

        logger.info("Found %d organizations in the system", len(orgs))

        # Process each organization
        for org in orgs:
            org_id = org["_key"]
            accountType = org.get("accountType", AccountType.INDIVIDUAL.value)

            # Ensure the method is called on the correct object
            if accountType == AccountType.ENTERPRISE.value or accountType == AccountType.BUSINESS.value:
                await initialize_enterprise_google_account_services_fn(org_id, app_container)
            elif accountType == AccountType.INDIVIDUAL.value:
                await initialize_individual_google_account_services_fn(org_id, app_container)
            else:
                logger.error("Account Type not valid")
                continue

            logger.info(
                "Processing organization %s with account type %s", org_id, accountType
            )

            # Get users for this organization
            users = await arango_service.get_users(org_id, active=True)
            logger.info(f"User: {users}")
            if not users:
                logger.info("No users found for organization %s", org_id)
                continue

            logger.info("Found %d users for organization %s", len(users), org_id)

            enabled_apps = await arango_service.get_org_apps(org_id)

            drive_sync_service = None
            gmail_sync_service = None
            onedrive_connector = None
            for app in enabled_apps:
                if app["name"].lower() == Connectors.GOOGLE_CALENDAR.value.lower():
                    logger.info("Skipping calendar sync for org %s", org_id)
                    continue

                if app["name"].lower() == Connectors.GOOGLE_DRIVE.value.lower():
                    drive_sync_service = app_container.drive_sync_service()  # type: ignore
                    await drive_sync_service.initialize(org_id)  # type: ignore
                    logger.info("Drive Service initialized for org %s", org_id)

                if app["name"].lower() == Connectors.GOOGLE_MAIL.value.lower():
                    gmail_sync_service = app_container.gmail_sync_service()  # type: ignore
                    await gmail_sync_service.initialize(org_id)  # type: ignore
                    logger.info("Gmail Service initialized for org %s", org_id)

                if app["name"].lower() == Connectors.ONEDRIVE.value.lower():
                    config_service = app_container.config_service()
                    arango_service = await app_container.arango_service()
                    data_entities_processor = DataSourceEntitiesProcessor(logger, OneDriveApp(), arango_service, config_service)
                    await data_entities_processor.initialize()
                    credentials_config = await config_service.get_config(f"/services/connectors/onedrive/config/{org_id}")
                    if not credentials_config:
                            logger.error("OneDrive credentials not found")
                            return False

                    tenant_id = credentials_config.get("tenantId")
                    client_id = credentials_config.get("clientId")
                    client_secret = credentials_config.get("clientSecret")
                    if not all((tenant_id, client_id, client_secret)):
                        logger.error(f"Incomplete OneDrive credentials for org_id: {org_id}. Ensure tenantId, clientId, and clientSecret are configured.")
                        return False
                    has_admin_consent = credentials_config.get("hasAdminConsent", False)
                    credentials = OneDriveCredentials(
                        tenant_id=tenant_id,
                        client_id=client_id,
                        client_secret=client_secret,
                        has_admin_consent=has_admin_consent,
                    )
                    onedrive_connector = OneDriveConnector(logger, data_entities_processor, arango_service, credentials)
                    app_container.onedrive_connector.override(providers.Object(onedrive_connector))
                    asyncio.create_task(onedrive_connector.run())  # type: ignore
                    logger.info("OneDrive connector initialized for org %s", org_id)

            if drive_sync_service is not None:
                try:
                    asyncio.create_task(drive_sync_service.perform_initial_sync(org_id))  # type: ignore
                    logger.info(
                        "✅ Resumed Drive sync for org %s",
                        org_id,
                    )
                except Exception as e:
                    logger.error(
                        "❌ Error resuming Drive sync for org %s: %s",
                        org_id,
                        str(e),
                    )

            if gmail_sync_service is not None:
                try:
                    asyncio.create_task(gmail_sync_service.perform_initial_sync(org_id))  # type: ignore
                    logger.info(
                        "✅ Resumed Gmail sync for org %s",
                        org_id,
                    )
                except Exception as e:
                    logger.error(
                        "❌ Error resuming Gmail sync for org %s: %s",
                        org_id,
                        str(e),
                    )


            logger.info("✅ Sync services resumed for org %s", org_id)
        logger.info("✅ Sync services resumed for all orgs")
        return True
    except Exception as e:
        logger.error("❌ Error during sync service resumption: %s", str(e))
        return False

async def start_messaging_producer(app_container: ConnectorAppContainer) -> None:
    """Start messaging producer and attach it to container"""
    logger = app_container.logger()

    try:
        logger.info("🚀 Starting Messaging Producer...")

        producer_config = await KafkaUtils.create_producer_config(app_container)

        # Create and initialize producer
        messaging_producer = MessagingFactory.create_producer(
            broker_type="kafka",
            logger=logger,
            config=producer_config
        )
        await messaging_producer.initialize()

        # Attach producer to container
        app_container.messaging_producer = messaging_producer

        logger.info("✅ Messaging producer started and attached to container")

    except Exception as e:
        logger.error(f"❌ Error starting messaging producer: {str(e)}")
        raise

async def start_kafka_consumers(app_container: ConnectorAppContainer) -> List:
    """Start all Kafka consumers at application level"""
    logger = app_container.logger()
    consumers = []

    try:
        # 1. Create Entity Consumer
        logger.info("🚀 Starting Entity Kafka Consumer...")
        entity_kafka_config = await KafkaUtils.create_entity_kafka_consumer_config(app_container)
        entity_kafka_consumer = MessagingFactory.create_consumer(
            broker_type="kafka",
            logger=logger,
            config=entity_kafka_config
        )
        entity_message_handler = await KafkaUtils.create_entity_message_handler(app_container)
        await entity_kafka_consumer.start(entity_message_handler)
        consumers.append(("entity", entity_kafka_consumer))
        logger.info("✅ Entity Kafka consumer started")

        # 2. Create Sync Consumer
        logger.info("🚀 Starting Sync Kafka Consumer...")
        sync_kafka_config = await KafkaUtils.create_sync_kafka_consumer_config(app_container)
        sync_kafka_consumer = MessagingFactory.create_consumer(
            broker_type="kafka",
            logger=logger,
            config=sync_kafka_config
        )
        sync_message_handler = await KafkaUtils.create_sync_message_handler(app_container)
        await sync_kafka_consumer.start(sync_message_handler)
        consumers.append(("sync", sync_kafka_consumer))
        logger.info("✅ Sync Kafka consumer started")

        logger.info(f"✅ All {len(consumers)} Kafka consumers started successfully")
        return consumers

    except Exception as e:
        logger.error(f"❌ Error starting Kafka consumers: {str(e)}")
        # Cleanup any started consumers
        for name, consumer in consumers:
            try:
                await consumer.stop()
                logger.info(f"Stopped {name} consumer during cleanup")
            except Exception as cleanup_error:
                logger.error(f"Error stopping {name} consumer during cleanup: {cleanup_error}")
        raise

async def stop_kafka_consumers(container: ConnectorAppContainer) -> None:
    """Stop all Kafka consumers"""

    logger = container.logger()
    consumers = getattr(container, 'kafka_consumers', [])
    for name, consumer in consumers:
        try:
            await consumer.stop()
            logger.info(f"✅ {name.title()} Kafka consumer stopped")
        except Exception as e:
            logger.error(f"❌ Error stopping {name} consumer: {str(e)}")

    # Clear the consumers list
    if hasattr(container, 'kafka_consumers'):
        container.kafka_consumers = []

async def stop_messaging_producer(container: ConnectorAppContainer) -> None:
    """Stop the messaging producer"""
    logger = container.logger()

    try:
        # Get the messaging producer from container
        messaging_producer = getattr(container, 'messaging_producer', None)
        if messaging_producer:
            await messaging_producer.cleanup()
            logger.info("✅ Messaging producer stopped successfully")
        else:
            logger.info("No messaging producer to stop")
    except Exception as e:
        logger.error(f"❌ Error stopping messaging producer: {str(e)}")

async def shutdown_container_resources(container: ConnectorAppContainer) -> None:
    """Shutdown all container resources properly"""
    logger = container.logger()

    try:
        # Stop Kafka consumers
        await stop_kafka_consumers(container)

        # Stop messaging producer
        await stop_messaging_producer(container)

        logger.info("✅ All container resources shut down successfully")

    except Exception as e:
        logger.error(f"❌ Error during container resource shutdown: {str(e)}")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager for FastAPI"""
    # Initialize container
    app_container = await get_initialized_container()
    app.container = app_container  # type: ignore

    app.state.config_service = app_container.config_service()
    app.state.arango_service = await app_container.arango_service()  # type: ignore

    logger = app_container.logger()
    logger.debug("🚀 Starting application")
    # Start messaging producer first
    try:
        await start_messaging_producer(app_container)
        logger.info("✅ Messaging producer started successfully")
    except Exception as e:
        logger.error(f"❌ Failed to start messaging producer: {str(e)}")
        raise

    # Start all Kafka consumers centrally
    try:
        consumers = await start_kafka_consumers(app_container)
        app_container.kafka_consumers = consumers
        logger.info("✅ All Kafka consumers started successfully")
    except Exception as e:
        logger.error(f"❌ Failed to start Kafka consumers: {str(e)}")
        raise

    # Resume sync services
    asyncio.create_task(resume_sync_services(app_container))

    yield
    logger.info("🔄 Shut down application started")
    # Shutdown all container resources
    try:
        await shutdown_container_resources(app_container)
    except Exception as e:
        logger.error(f"❌ Error during application shutdown: {str(e)}")


# Create FastAPI app with lifespan
app = FastAPI(
    title="Google Drive Sync Service",
    description="Service for syncing Google Drive content to ArangoDB",
    version="1.0.0",
    lifespan=lifespan,
    dependencies=[Depends(get_initialized_container)],
)

# List of paths to apply authentication to
INCLUDE_PATHS = ["/api/v1/stream/record/", "/api/v1/delete/"]


@app.middleware("http")
async def authenticate_requests(request: Request, call_next)-> JSONResponse:
    logger = app.container.logger()  # type: ignore
    logger.info(f"Middleware request: {request.url.path}")
    # Apply middleware only to specific paths
    if not any(request.url.path.startswith(path) for path in INCLUDE_PATHS):
        # Skip authentication for other paths
        return await call_next(request)

    try:
        # Apply authentication
        authenticated_request = await authMiddleware(request)
        # Continue with the request
        logger.info("Call Next")
        response = await call_next(authenticated_request)
        return response

    except HTTPException as exc:
        # Handle authentication errors
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    except Exception:
        # Handle unexpected errors
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )


# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@router.get("/health")
async def health_check() -> JSONResponse:
    """Basic health check endpoint"""
    try:
        return JSONResponse(
            status_code=200,
            content={
                "status": "healthy",
                "timestamp": get_epoch_timestamp_in_ms(),
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "fail",
                "error": str(e),
                "timestamp": get_epoch_timestamp_in_ms(),
            },
        )


# Include routes
app.include_router(router)
app.include_router(kb_router)


# Global error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger = app.container.logger()  # type: ignore
    logger.error("Global error: %s", str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": str(exc), "path": request.url.path},
    )


def run(host: str = "0.0.0.0", port: int = 8088, workers: int = 1, reload: bool = True) -> None:
    """Run the application"""
    uvicorn.run(
        "app.connectors_main:app",
        host=host,
        port=port,
        log_level="info",
        reload=reload,
        workers=workers,
    )


if __name__ == "__main__":
    run(reload=False)

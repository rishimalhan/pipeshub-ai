from contextlib import asynccontextmanager
from logging import Logger
from typing import AsyncContextManager, Dict, List, Optional

from arango.database import TransactionDatabase

from app.config.constants.arangodb import CollectionNames, Connectors
from app.connectors.core.base.data_store.data_store import (
    DataStoreProvider,
    TransactionStore,
)
from app.connectors.services.base_arango_service import BaseArangoService
from app.models.entities import (
    Anyone,
    AnyoneSameOrg,
    AnyoneWithLink,
    AppUser,
    AppUserGroup,
    Domain,
    Org,
    Record,
    RecordGroup,
    RecordType,
    User,
)
from app.models.permission import Permission
from app.utils.time_conversion import get_epoch_timestamp_in_ms

read_collections = [
    collection.value for collection in CollectionNames
]

write_collections = [
    collection.value for collection in CollectionNames
]

class ArangoTransactionStore(TransactionStore):
    """ArangoDB transaction-aware data store"""

    def __init__(self, arango_service: BaseArangoService, txn: TransactionDatabase) -> None:
        self.arango_service = arango_service
        self.txn = txn
        self.logger = arango_service.logger

    async def get_record_by_key(self, key: str) -> Optional[Record]:
        return await self.arango_service.get_record_by_id(key, transaction=self.txn)

    async def get_record_by_external_id(self, connector_name: Connectors, external_id: str) -> Optional[Record]:
        return await self.arango_service.get_record_by_external_id(connector_name, external_id, transaction=self.txn)

    async def get_record_group_by_external_id(self, connector_name: Connectors, external_id: str) -> Optional[RecordGroup]:
        return await self.arango_service.get_record_group_by_external_id(connector_name, external_id, transaction=self.txn)

    async def get_user_by_email(self, email: str) -> Optional[User]:
        return await self.arango_service.get_user_by_email(email, transaction=self.txn)

    async def delete_record_by_key(self, key: str) -> None:
        return await self.arango_service.delete_record(key, transaction=self.txn)

    async def delete_record_by_external_id(self, connector_name: Connectors, external_id: str) -> None:
        return await self.arango_service.delete_record_by_external_id(connector_name, external_id, transaction=self.txn)

    async def delete_record_group_by_external_id(self, connector_name: Connectors, external_id: str) -> None:
        return await self.arango_service.delete_record_group_by_external_id(connector_name, external_id, transaction=self.txn)

    async def get_users(self, org_id: str, active: bool = True) -> List[User]:
        return await self.arango_service.get_users(org_id, active)

    async def batch_upsert_records(self, records: List[Record]) -> None:

        for record in records:
            # Define record type configurations
            record_type_config = {
                RecordType.FILE: {
                    "collection": CollectionNames.FILES.value,
                },
                RecordType.MAIL: {
                    "collection": CollectionNames.MAILS.value,
                },
                # RecordType.MESSAGE.value: {
                #     "collection": CollectionNames.MESSAGES.value,
                # },
                RecordType.WEBPAGE: {
                    "collection": CollectionNames.WEBPAGES.value,
                },
                RecordType.TICKET: {
                    "collection": CollectionNames.TICKETS.value,
                },
            }

            # Get the configuration for the current record type
            record_type = record.record_type
            if record_type not in record_type_config:
                self.logger.error(f"❌ Unsupported record type: {record_type}")
                return

            config = record_type_config[record_type]

            # Create the IS_OF_TYPE edge
            is_of_type_record = {
                "_from": f"{CollectionNames.RECORDS.value}/{record.id}",
                "_to": f"{config['collection']}/{record.id}",
                "createdAtTimestamp": get_epoch_timestamp_in_ms(),
                "updatedAtTimestamp": get_epoch_timestamp_in_ms(),
            }

            # Upsert base record
            await self.arango_service.batch_upsert_nodes([record.to_arango_base_record()], collection=CollectionNames.RECORDS.value, transaction=self.txn)
            # Upsert specific record type if it has a specific method
            await self.arango_service.batch_upsert_nodes([record.to_arango_record()], collection=config["collection"], transaction=self.txn)


            # Create IS_OF_TYPE edge
            await self.arango_service.batch_create_edges([is_of_type_record], collection=CollectionNames.IS_OF_TYPE.value, transaction=self.txn)

        return True

    async def batch_upsert_record_groups(self, record_groups: List[RecordGroup]) -> None:
        return await self.arango_service.batch_upsert_nodes(
                [record_group.to_arango_base_record_group() for record_group in record_groups],
                collection=CollectionNames.RECORD_GROUPS.value,
                transaction=self.txn
            )

    async def batch_upsert_record_permissions(self, record_id: str, permissions: List[Permission]) -> None:
        return await self.arango_service.batch_upsert_record_permissions(record_id, permissions, transaction=self.txn)

    async def batch_upsert_record_group_permissions(self, record_group_id: str, permissions: List[Permission]) -> None:
        return await self.arango_service.batch_upsert_record_group_permissions(record_group_id, permissions, transaction=self.txn)

    async def batch_upsert_user_groups(self, user_groups: List[AppUserGroup]) -> None:
        return await self.arango_service.batch_upsert_nodes(
                            [user_group.to_arango_base_user_group() for user_group in user_groups],
                            collection=CollectionNames.GROUPS.value,
                            transaction=self.txn
                        )

    async def batch_upsert_app_users(self, users: List[AppUser]) -> None:
        orgs = await self.arango_service.get_all_orgs()
        if not orgs:
            raise Exception("No organizations found in the database. Cannot initialize DataSourceEntitiesProcessor.")
        org_id = orgs[0]["_key"]

        for user in users:
            user_record = await self.arango_service.get_user_by_email(user.email)

            if not user_record:
                await self.arango_service.batch_upsert_nodes(
                    [{**user.to_arango_base_user(), "orgId": org_id, "isActive": False}],
                    collection=CollectionNames.USERS.value,
                    transaction=self.txn
                )

                # Create a edge between the user and the org if it doesn't exist
                user_org_relation = {
                    "_from": f"{CollectionNames.USERS.value}/{user.id}",
                    "_to": f"{CollectionNames.ORGS.value}/{org_id}",
                    "createdAtTimestamp": user.created_at,
                    "updatedAtTimestamp": user.updated_at,
                    "entityType": "ORGANIZATION",
                }
                await self.arango_service.batch_create_edges(
                    [user_org_relation], collection=CollectionNames.BELONGS_TO.value, transaction=self.txn
                )


            # Todo: Create app if it doesn't exist
            # Todo: Create a edge between the user and the app with sync status if it doesn't exist
            # user_app_relation = {
            #     "_from": f"{CollectionNames.USERS.value}/{user_record['_key']}",
            #     "_to": f"{CollectionNames.APPS.value}/{self.app.id}",
            #     "createdAtTimestamp": get_epoch_timestamp_in_ms(),
            #     "updatedAtTimestamp": get_epoch_timestamp_in_ms(),
            #     "syncState": "PENDING",
            # }

            # await self.arango_service.batch_create_edges(
            #     [user_app_relation], collection=CollectionNames.BELONGS_TO.value, transaction=transaction
            # )



    async def batch_upsert_orgs(self, orgs: List[Org]) -> None:
        return await self.arango_service.batch_upsert_orgs(orgs, transaction=self.txn)

    async def batch_upsert_domains(self, domains: List[Domain]) -> None:
        return await self.arango_service.batch_upsert_domains(domains, transaction=self.txn)

    async def batch_upsert_anyone(self, anyone: List[Anyone]) -> None:
        return await self.arango_service.batch_upsert_anyone(anyone, transaction=self.txn)

    async def batch_upsert_anyone_with_link(self, anyone_with_link: List[AnyoneWithLink]) -> None:
        return await self.arango_service.batch_upsert_anyone_with_link(anyone_with_link, transaction=self.txn)

    async def batch_upsert_anyone_same_org(self, anyone_same_org: List[AnyoneSameOrg]) -> None:
        return await self.arango_service.batch_upsert_anyone_same_org(anyone_same_org, transaction=self.txn)

    async def commit(self) -> None:
        """Commit the ArangoDB transaction"""
        self.txn.commit_transaction()

    async def rollback(self) -> None:
        """Rollback the ArangoDB transaction"""
        self.txn.abort_transaction()

    async def create_record_relation(self, from_record_id: str, to_record_id: str, relation_type: str) -> None:
        record_edge = {
                    "_from": f"{CollectionNames.RECORDS.value}/{from_record_id}",
                    "_to": f"{CollectionNames.RECORDS.value}/{to_record_id}",
                    "relationshipType": relation_type,
                    "createdAtTimestamp": get_epoch_timestamp_in_ms(),
                    "updatedAtTimestamp": get_epoch_timestamp_in_ms(),
                }

        await self.arango_service.batch_create_edges(
            [record_edge], collection=CollectionNames.RECORD_RELATIONS.value, transaction=self.txn
        )
    async def create_record_group_relation(self, record_id: str, record_group_id: str) -> None:
        record_edge = {
                    "_from": f"{CollectionNames.RECORDS.value}/{record_id}",
                    "_to": f"{CollectionNames.RECORD_GROUPS.value}/{record_group_id}",
                    "createdAtTimestamp": get_epoch_timestamp_in_ms(),
                    "updatedAtTimestamp": get_epoch_timestamp_in_ms(),
                }
        await self.arango_service.batch_create_edges(
            [record_edge], collection=CollectionNames.BELONGS_TO.value, transaction=self.txn
        )

    async def get_sync_point(self, sync_point_key: str) -> Optional[Dict]:
        return await self.arango_service.get_sync_point(sync_point_key, CollectionNames.SYNC_POINTS.value, transaction=self.txn)

    async def get_all_orgs(self) -> List[Org]:
        return await self.arango_service.get_all_orgs()

    async def create_record_permissions(self, record_id: str, permissions: List[Permission]) -> None:
        return await self.arango_service.batch_create_edges([permission.to_arango_permission() for permission in permissions],
                    collection=CollectionNames.PERMISSIONS.value, transaction=self.txn)

    async def create_record_group_permissions(self, record_group_id: str, permissions: List[Permission]) -> None:
        return await self.arango_service.batch_create_edges([permission.to_arango_permission() for permission in permissions],
                    collection=CollectionNames.PERMISSIONS.value, transaction=self.txn)

    async def create_user_groups(self, user_groups: List[AppUserGroup]) -> None:
        return await self.arango_service.batch_upsert_nodes([user_group.to_arango_base_user_group() for user_group in user_groups],
                    collection=CollectionNames.GROUPS.value, transaction=self.txn)

    async def create_users(self, users: List[AppUser]) -> None:
        return await self.arango_service.batch_upsert_nodes([user.to_arango_base_user() for user in users],
                    collection=CollectionNames.USERS.value, transaction=self.txn)

    async def create_orgs(self, orgs: List[Org]) -> None:
        return await self.arango_service.batch_upsert_nodes([org.to_arango_base_org() for org in orgs],
                    collection=CollectionNames.ORGS.value, transaction=self.txn)

    async def create_domains(self, domains: List[Domain]) -> None:
        return await self.arango_service.batch_upsert_nodes([domain.to_arango_base_domain() for domain in domains],
                    collection=CollectionNames.DOMAINS.value, transaction=self.txn)

    async def create_anyone(self, anyone: List[Anyone]) -> None:
        return await self.arango_service.batch_upsert_nodes([anyone.to_arango_base_anyone() for anyone in anyone],
                    collection=CollectionNames.ANYONE.value, transaction=self.txn)

    async def create_anyone_with_link(self, anyone_with_link: List[AnyoneWithLink]) -> None:
        return await self.arango_service.batch_upsert_nodes([anyone_with_link.to_arango_base_anyone_with_link() for anyone_with_link in anyone_with_link],
                    collection=CollectionNames.ANYONE_WITH_LINK.value, transaction=self.txn)

    async def create_anyone_same_org(self, anyone_same_org: List[AnyoneSameOrg]) -> None:
        return await self.arango_service.batch_upsert_nodes([anyone_same_org.to_arango_base_anyone_same_org() for anyone_same_org in anyone_same_org],
                    collection=CollectionNames.ANYONE_SAME_ORG.value, transaction=self.txn)

    async def create_sync_point(self, sync_point_key: str, sync_point_data: Dict) -> None:
        return await self.arango_service.upsert_sync_point(sync_point_key, sync_point_data, collection=CollectionNames.SYNC_POINTS.value, transaction=self.txn)

    async def delete_sync_point(self, sync_point_key: str) -> None:
        return await self.arango_service.remove_sync_point([sync_point_key],
                    collection=CollectionNames.SYNC_POINTS.value, transaction=self.txn)
    async def read_sync_point(self, sync_point_key: str) -> None:
        return await self.arango_service.get_sync_point(sync_point_key, collection=CollectionNames.SYNC_POINTS.value, transaction=self.txn)

    async def update_sync_point(self, sync_point_key: str, sync_point_data: Dict) -> None:
        return await self.arango_service.upsert_sync_point(sync_point_key, sync_point_data, collection=CollectionNames.SYNC_POINTS.value, transaction=self.txn)

    async def batch_create_edges(self, edges: List[Dict], collection: str) -> None:
        return await self.arango_service.batch_create_edges(edges, collection=collection, transaction=self.txn)

class ArangoDataStore(DataStoreProvider):
    """ArangoDB data store"""
    def __init__(self, logger: Logger, arango_service: BaseArangoService) -> None:
        self.arango_service = arango_service

    @asynccontextmanager
    async def transaction(self) -> AsyncContextManager["TransactionStore"]:
        """
        Create an ArangoDB transaction store context manager.
        """
        db = self.arango_service.db

        # Begin transaction
        txn = db.begin_transaction(
            read=read_collections,
            write=write_collections
        )

        tx_store = ArangoTransactionStore(self.arango_service, txn)

        try:
            yield tx_store
        except Exception:
            await tx_store.rollback()
            raise
        else:
            await tx_store.commit()

    async def execute_in_transaction(self, func, *args, **kwargs) -> None:
        """Execute function within ArangoDB transaction"""
        async with self.transaction() as tx_store:
            return func(tx_store, *args, **kwargs)

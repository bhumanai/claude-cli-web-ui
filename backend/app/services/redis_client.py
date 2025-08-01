"""Redis client for task queue management."""

import asyncio
import json
from typing import Any, Dict, List, Optional, Tuple

try:
    import redis.asyncio as redis
    from redis.asyncio.retry import Retry
    from redis.backoff import ExponentialBackoff
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None
    Retry = None
    ExponentialBackoff = None

from app.config import get_settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class RedisClient:
    """Redis client for task queue operations."""
    
    def __init__(self):
        self.settings = get_settings()
        self._client: Optional[redis.Redis] = None
        self._connection_pool: Optional[redis.ConnectionPool] = None
    
    async def initialize(self) -> None:
        """Initialize Redis connection."""
        if not self.settings.USE_REDIS:
            logger.info("Redis is disabled, skipping initialization")
            return
            
        if not REDIS_AVAILABLE:
            logger.warning("Redis library not available, disabling Redis features")
            return
        
        logger.info("Initializing Redis connection", 
                   redis_url=self.settings.REDIS_URL.split("@")[-1])  # Hide credentials
        
        try:
            # Create connection pool
            self._connection_pool = redis.ConnectionPool.from_url(
                self.settings.REDIS_URL,
                retry=Retry(
                    backoff=ExponentialBackoff(),
                    retries=self.settings.REDIS_MAX_RETRIES
                ),
                retry_on_timeout=True,
                socket_keepalive=True,
                socket_keepalive_options={},
                health_check_interval=30
            )
            
            # Create Redis client
            self._client = redis.Redis(
                connection_pool=self._connection_pool,
                decode_responses=True
            )
            
            # Test connection
            await self._client.ping()
            
            logger.info("Redis connection initialized successfully")
            
        except Exception as e:
            logger.error("Failed to initialize Redis connection", error=str(e))
            raise
    
    async def close(self) -> None:
        """Close Redis connection."""
        if self._client:
            logger.info("Closing Redis connection")
            await self._client.aclose()
        
        if self._connection_pool:
            await self._connection_pool.aclose()
        
        self._client = None
        self._connection_pool = None
        logger.info("Redis connection closed")
    
    @property
    def client(self) -> redis.Redis:
        """Get Redis client."""
        if not self._client:
            raise RuntimeError("Redis client not initialized")
        return self._client
    
    async def health_check(self) -> bool:
        """Check Redis connection health."""
        try:
            if not self._client:
                return False
            await self._client.ping()
            return True
        except Exception as e:
            logger.error("Redis health check failed", error=str(e))
            return False
    
    # Stream operations
    async def create_stream_group(
        self, 
        stream_key: str, 
        group_name: str, 
        start_id: str = "0"
    ) -> bool:
        """
        Create a consumer group for a stream.
        
        Args:
            stream_key: Stream key
            group_name: Consumer group name
            start_id: Starting message ID
            
        Returns:
            True if group was created, False if it already exists
        """
        try:
            await self.client.xgroup_create(
                stream_key, 
                group_name, 
                start_id, 
                mkstream=True
            )
            logger.info("Created stream group", 
                       stream=stream_key, group=group_name)
            return True
        except redis.ResponseError as e:
            if "BUSYGROUP" in str(e):
                logger.debug("Stream group already exists", 
                           stream=stream_key, group=group_name)
                return False
            raise
    
    async def add_to_stream(
        self, 
        stream_key: str, 
        data: Dict[str, Any],
        max_length: Optional[int] = None
    ) -> str:
        """
        Add message to stream.
        
        Args:
            stream_key: Stream key
            data: Message data
            max_length: Maximum stream length (for trimming)
            
        Returns:
            Message ID
        """
        # Serialize data
        serialized_data = {
            key: json.dumps(value) if not isinstance(value, str) else value
            for key, value in data.items()
        }
        
        # Add to stream
        message_id = await self.client.xadd(
            stream_key, 
            serialized_data,
            maxlen=max_length,
            approximate=True if max_length else False
        )
        
        logger.debug("Added message to stream", 
                    stream=stream_key, message_id=message_id)
        
        return message_id
    
    async def read_from_stream(
        self,
        stream_key: str,
        group_name: str,
        consumer_name: str,
        count: int = 1,
        block: Optional[int] = None
    ) -> List[Tuple[str, str, Dict[str, Any]]]:
        """
        Read messages from stream as part of consumer group.
        
        Args:
            stream_key: Stream key
            group_name: Consumer group name
            consumer_name: Consumer name
            count: Maximum number of messages to read
            block: Block for specified milliseconds if no messages
            
        Returns:
            List of (stream_key, message_id, data) tuples
        """
        try:
            result = await self.client.xreadgroup(
                group_name,
                consumer_name,
                {stream_key: ">"},
                count=count,
                block=block
            )
            
            messages = []
            for stream, stream_messages in result:
                for message_id, fields in stream_messages:
                    # Deserialize data
                    data = {}
                    for key, value in fields.items():
                        try:
                            data[key] = json.loads(value)
                        except (json.JSONDecodeError, TypeError):
                            data[key] = value
                    
                    messages.append((stream, message_id, data))
            
            logger.debug("Read messages from stream",
                        stream=stream_key, count=len(messages))
            
            return messages
            
        except Exception as e:
            logger.error("Failed to read from stream", 
                        stream=stream_key, error=str(e))
            raise
    
    async def acknowledge_message(
        self,
        stream_key: str,
        group_name: str,
        message_id: str
    ) -> bool:
        """
        Acknowledge message processing.
        
        Args:
            stream_key: Stream key
            group_name: Consumer group name
            message_id: Message ID to acknowledge
            
        Returns:
            True if message was acknowledged
        """
        try:
            result = await self.client.xack(stream_key, group_name, message_id)
            
            logger.debug("Acknowledged message",
                        stream=stream_key, message_id=message_id)
            
            return result > 0
            
        except Exception as e:
            logger.error("Failed to acknowledge message",
                        stream=stream_key, message_id=message_id, error=str(e))
            raise
    
    async def get_pending_messages(
        self,
        stream_key: str,
        group_name: str,
        consumer_name: Optional[str] = None,
        count: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get pending messages for consumer group.
        
        Args:
            stream_key: Stream key
            group_name: Consumer group name
            consumer_name: Specific consumer name (optional)
            count: Maximum number of messages to return
            
        Returns:
            List of pending message info
        """
        try:
            if consumer_name:
                result = await self.client.xpending_range(
                    stream_key, group_name, "-", "+", count, consumer_name
                )
            else:
                result = await self.client.xpending(stream_key, group_name)
            
            return result
            
        except Exception as e:
            logger.error("Failed to get pending messages",
                        stream=stream_key, error=str(e))
            raise
    
    async def claim_messages(
        self,
        stream_key: str,
        group_name: str,
        consumer_name: str,
        min_idle_time: int,
        message_ids: List[str]
    ) -> List[Tuple[str, Dict[str, Any]]]:
        """
        Claim idle messages from other consumers.
        
        Args:
            stream_key: Stream key
            group_name: Consumer group name
            consumer_name: Consumer name to claim for
            min_idle_time: Minimum idle time in milliseconds
            message_ids: List of message IDs to claim
            
        Returns:
            List of (message_id, data) tuples
        """
        try:
            result = await self.client.xclaim(
                stream_key,
                group_name,
                consumer_name,
                min_idle_time,
                message_ids
            )
            
            messages = []
            for message_id, fields in result:
                # Deserialize data
                data = {}
                for key, value in fields.items():
                    try:
                        data[key] = json.loads(value)
                    except (json.JSONDecodeError, TypeError):
                        data[key] = value
                
                messages.append((message_id, data))
            
            logger.debug("Claimed messages",
                        stream=stream_key, count=len(messages))
            
            return messages
            
        except Exception as e:
            logger.error("Failed to claim messages",
                        stream=stream_key, error=str(e))
            raise
    
    async def delete_message(self, stream_key: str, message_id: str) -> bool:
        """
        Delete message from stream.
        
        Args:
            stream_key: Stream key
            message_id: Message ID to delete
            
        Returns:
            True if message was deleted
        """
        try:
            result = await self.client.xdel(stream_key, message_id)
            
            logger.debug("Deleted message from stream",
                        stream=stream_key, message_id=message_id)
            
            return result > 0
            
        except Exception as e:
            logger.error("Failed to delete message",
                        stream=stream_key, message_id=message_id, error=str(e))
            raise
    
    async def get_stream_info(self, stream_key: str) -> Dict[str, Any]:
        """
        Get stream information.
        
        Args:
            stream_key: Stream key
            
        Returns:
            Stream information
        """
        try:
            return await self.client.xinfo_stream(stream_key)
        except Exception as e:
            logger.error("Failed to get stream info",
                        stream=stream_key, error=str(e))
            raise
    
    async def trim_stream(
        self, 
        stream_key: str, 
        max_length: int, 
        approximate: bool = True
    ) -> int:
        """
        Trim stream to maximum length.
        
        Args:
            stream_key: Stream key
            max_length: Maximum stream length
            approximate: Use approximate trimming for better performance
            
        Returns:
            Number of messages removed
        """
        try:
            result = await self.client.xtrim(
                stream_key, 
                maxlen=max_length, 
                approximate=approximate
            )
            
            logger.debug("Trimmed stream",
                        stream=stream_key, removed=result)
            
            return result
            
        except Exception as e:
            logger.error("Failed to trim stream",
                        stream=stream_key, error=str(e))
            raise


# Global Redis client instance
redis_client = RedisClient()


async def get_redis_client() -> RedisClient:
    """Get Redis client instance."""
    if not redis_client._client:
        await redis_client.initialize()
    return redis_client


async def initialize_redis() -> None:
    """Initialize Redis on application startup."""
    await redis_client.initialize()


async def close_redis() -> None:
    """Close Redis connection on application shutdown."""
    await redis_client.close()
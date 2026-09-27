import os
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

DATABASE_URL = os.environ.get("DATABASE_URL", "")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

parsed = urlparse(DATABASE_URL)
query_params = parse_qs(parsed.query)
# asyncpg doesn't accept libpq-only params in the URL; translate sslmode into connect_args.
_sslmode = (query_params.pop("sslmode", [""])[0] or os.environ.get("PGSSLMODE", "")).lower()
query_params.pop("channel_binding", None)
_ssl = "require" if _sslmode in ("require", "verify-ca", "verify-full") else False
clean_query = urlencode(query_params, doseq=True)
DATABASE_URL = urlunparse(parsed._replace(query=clean_query))

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
    connect_args={"ssl": _ssl},
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

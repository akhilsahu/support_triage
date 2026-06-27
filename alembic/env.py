from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, String
from alembic import context
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import Base
from app.models import agent, workflow, task, execution, conversation, document  # noqa
from app.models import space, chat, chatbot, datasource, knowledge_base  # noqa

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url():
    return os.getenv(
        "DATABASE_URL",
        config.get_main_option("sqlalchemy.url")
    ).replace("postgresql+asyncpg://", "postgresql://")


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            transaction_per_migration=True,  # each migration gets its own transaction
            version_num_col_type=String(128),  # allow long revision IDs
        )
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

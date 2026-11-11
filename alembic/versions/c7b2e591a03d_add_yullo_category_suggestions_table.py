"""add_yullo_category_suggestions_table

Revision ID: c7b2e591a03d
Revises: bc9e0d87ae89
Create Date: 2026-10-19 17:00:00.000000

"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c7b2e591a03d'
down_revision: Union[str, None] = 'bc9e0d87ae89'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INITIAL_CATEGORIES = [
    # Business
    ("E-commerce & Retail", "business", True),
    ("E-commerce", "business", True),
    ("SaaS & Software", "business", True),
    ("Technology & IT Services", "business", True),
    ("Healthcare & Medical", "business", True),
    ("Consulting & Professional Services", "business", True),
    ("Finance & Fintech", "business", True),
    ("Food, Dining & Beverage", "business", True),
    ("Hospitality & Travel", "business", False),
    ("Real Estate & Architecture", "business", False),
    ("Marketing, PR & Advertising", "business", False),
    ("Manufacturing & Industrial", "business", False),
    ("Legal & Regulatory Services", "business", False),
    ("Logistics & Supply Chain", "business", False),
    ("Fitness, Sports & Wellness", "business", False),
    ("Education & EdTech", "business", False),
    ("Media, Film & Entertainment", "business", False),
    ("CleanTech & Energy", "business", False),
    ("Aerospace & Space Technology", "business", False),
    ("Automotive & Mobility", "business", False),
    ("Design & Creative Agency", "business", False),
    ("Cybersecurity & Privacy", "business", False),
    ("AI & Machine Learning", "business", True),
    ("Fashion & Apparel", "business", False),
    ("Beauty & Cosmetics", "business", False),
    ("Biotechnology & Life Sciences", "business", False),
    ("Telecommunications", "business", False),
    ("Agriculture & AgriTech", "business", False),
    ("Construction & Contracting", "business", False),

    # Creator
    ("Content Creator & Influencer", "creator", True),
    ("Digital Artist & Illustrator", "creator", True),
    ("Writer & Author", "creator", True),
    ("Podcaster & Broadcaster", "creator", True),
    ("Musician, Producer & DJ", "creator", True),
    ("Photographer", "creator", True),
    ("Videographer & Filmmaker", "creator", True),
    ("UI/UX & Product Designer", "creator", True),
    ("Software Developer & Indie Hacker", "creator", True),
    ("Educator & Course Creator", "creator", False),
    ("Streamer & Gaming Creator", "creator", False),
    ("Fashion & Style Creator", "creator", False),
    ("Chef & Culinary Creator", "creator", False),
    ("3D Artist & Animator", "creator", False),
    ("Craftsman & Artisan", "creator", False),
    ("Journalist & Commentator", "creator", False),
    ("Comic & Storyboard Artist", "creator", False),
    ("Fitness Trainer & Coach", "creator", False),

    # Myself / Person
    ("Personal Portfolio", "person", True),
    ("Software Engineer & Developer", "person", True),
    ("Founder & Entrepreneur", "person", True),
    ("Product Manager", "person", True),
    ("Designer & Creative", "person", True),
    ("Researcher & Scientist", "person", False),
    ("Writer & Journalist", "person", False),
    ("Executive & Leader", "person", False),
    ("Consultant & Strategist", "person", False),
    ("Student & Learner", "person", False),
    ("Doctor & Healthcare Specialist", "person", False),
    ("Lawyer & Legal Advocate", "person", False),
    ("Architect & Urbanist", "person", False),
    ("Investor & Advisor", "person", False),
    ("Community Leader", "person", False),

    # Organization / Community
    ("Non-Profit & NGO", "organization", True),
    ("Open Source Project", "organization", True),
    ("Community & Social Club", "organization", True),
    ("Event & Conference Organizer", "organization", True),
    ("Educational Institution & University", "organization", False),
    ("Sports Club & League", "organization", False),
    ("Arts & Cultural Collective", "organization", False),
    ("Charity & Philanthropy", "organization", False),
    ("Alumni Association", "organization", False),
    ("Professional Association", "organization", False),
    ("Think Tank & Policy Institute", "organization", False),
    ("Environmental & Climate Coalition", "organization", False),
    ("Youth & Student Association", "organization", False),
]


def upgrade() -> None:
    table = op.create_table(
        'yullo_category_suggestions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('purpose', sa.String(length=50), nullable=True),
        sa.Column('is_popular', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('usage_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)
    )
    op.create_index('ix_yullo_category_suggestions_name', 'yullo_category_suggestions', ['name'], unique=True)
    op.create_index('ix_yullo_category_suggestions_purpose', 'yullo_category_suggestions', ['purpose'], unique=False)

    # Seed initial categories
    rows = [
        {
            "id": uuid.uuid4(),
            "name": name,
            "purpose": purpose,
            "is_popular": is_popular,
            "usage_count": 0,
        }
        for name, purpose, is_popular in INITIAL_CATEGORIES
    ]
    op.bulk_insert(table, rows)


def downgrade() -> None:
    op.drop_index('ix_yullo_category_suggestions_purpose', table_name='yullo_category_suggestions')
    op.drop_index('ix_yullo_category_suggestions_name', table_name='yullo_category_suggestions')
    op.drop_table('yullo_category_suggestions')

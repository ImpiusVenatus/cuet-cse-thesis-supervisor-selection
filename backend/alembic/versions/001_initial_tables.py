"""initial tables

Revision ID: 001
Revises: 
Create Date: 2026-04-13

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'supervisors',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('designation', sa.String(50), nullable=False),
        sa.Column('email', sa.String(200), unique=True, nullable=True),
        sa.Column('total_capacity', sa.Integer(), nullable=False),
        sa.Column('choice_capacity', sa.Integer(), nullable=False),
        sa.Column('lottery_capacity', sa.Integer(), nullable=False),
        sa.Column('choice_filled', sa.Integer(), default=0),
        sa.Column('lottery_filled', sa.Integer(), default=0),
        sa.Column('is_available', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'students',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('student_id', sa.String(50), unique=True, nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('merit_rank', sa.Integer(), unique=True, nullable=False),
        sa.Column('email', sa.String(200), unique=True, nullable=True),
        sa.Column('has_choice_privilege', sa.Boolean(), default=False),
        sa.Column('has_forfeited', sa.Boolean(), default=False),
        sa.Column('forfeit_order', sa.Integer(), nullable=True),
        sa.Column('supervisor_id', sa.Integer(), sa.ForeignKey('supervisors.id'), nullable=True),
        sa.Column('assignment_type', sa.String(10), nullable=True),
        sa.Column('assignment_time', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'session_config',
        sa.Column('id', sa.Integer(), primary_key=True, default=1),
        sa.Column('total_students', sa.Integer(), default=0),
        sa.Column('choice_threshold', sa.Integer(), default=0),
        sa.Column('session_status', sa.String(20), default='setup'),
        sa.Column('current_choice_rank', sa.Integer(), default=1),
        sa.Column('forfeit_count', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'event_log',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('students.id'), nullable=True),
        sa.Column('supervisor_id', sa.Integer(), sa.ForeignKey('supervisors.id'), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('event_log')
    op.drop_table('session_config')
    op.drop_table('students')
    op.drop_table('supervisors')

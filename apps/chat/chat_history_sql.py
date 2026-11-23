"""Static shared predicate for summary snapshots (alias m = chat_messages).

Leave unfinished user messages and their checkpoints intact. They cannot be
paired into a completed summary, but must not block compaction of later work.
Legacy messages without response runs remain compatible.
"""
COMPLETED_OR_LEGACY_USER_SQL = """AND (
    m.role <> 'user'
    OR NOT EXISTS (SELECT 1 FROM chat_response_runs unfinished
        WHERE unfinished.user_message_id=m.id AND unfinished.conversation_id=m.conversation_id)
    OR EXISTS (SELECT 1 FROM chat_response_runs finished
        WHERE finished.user_message_id=m.id AND finished.conversation_id=m.conversation_id
          AND finished.status='completed')
)"""

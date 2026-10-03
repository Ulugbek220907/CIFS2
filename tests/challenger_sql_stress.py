import sqlite3
import sys

def main():
    print("=" * 60)
    print("ADVERSARIAL SQL CHECK CONSTRAINT STRESS HARNESS")
    print("=" * 60)

    conn = sqlite3.connect(":memory:")
    cursor = conn.cursor()

    # Exact DDL derived from supabase/migrations/0007_site_analytics.sql
    ddl = """
    CREATE TABLE site_analytics (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL CHECK (event_type IN ('page_visit', 'quiz_start', 'quiz_complete')),
        session_id TEXT NOT NULL,
        subject TEXT NULL CHECK (
            subject IS NULL OR subject IN (
                'Quantitative Methods',
                'Academic Communication Skills',
                'Professional Skills & Employability',
                'Critical Thinking & Citizenship',
                'Introduction to Business and Economics',
                'Foundations of Economics',
                'Understanding Finance',
                'Math for Eco',
                'Exploring Economics',
                'Contemporary Issues in Global Economy',
                'Financial Accounting',
                'Fundamentals of Statistics',
                'Essentials of Economics'
            )
        ),
        theme TEXT NULL CHECK (
            theme IS NULL OR theme IN (
                'Theme 1', 'Theme 2', 'Theme 3', 'Theme 4',
                'Theme 5', 'Theme 6', 'Theme 7', 'Theme 8',
                'Theme 9', 'Theme 10', 'Theme 11', 'Theme 12'
            )
        ),
        score INTEGER NULL CHECK (score IS NULL OR score >= 0),
        total_questions INTEGER NULL CHECK (total_questions IS NULL OR total_questions > 0),
        time_taken_seconds INTEGER NULL CHECK (time_taken_seconds IS NULL OR time_taken_seconds >= 0),
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """
    cursor.execute(ddl)

    subjects = [
        'Quantitative Methods',
        'Academic Communication Skills',
        'Professional Skills & Employability',
        'Critical Thinking & Citizenship',
        'Introduction to Business and Economics',
        'Foundations of Economics',
        'Understanding Finance',
        'Math for Eco',
        'Exploring Economics',
        'Contemporary Issues in Global Economy',
        'Financial Accounting',
        'Fundamentals of Statistics',
        'Essentials of Economics'
    ]
    themes = [f'Theme {i}' for i in range(1, 13)]

    # 1. Positive tests
    print("[1/5] Testing positive valid insert scenarios...")
    # Page visit
    cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, subject, theme, score, total_questions, time_taken_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   ('pv-1', 'page_visit', 'sess-1', None, None, None, None, None))
    
    # Quiz start across all 13 subjects and 12 themes (156 combos)
    count = 0
    for s in subjects:
        for t in themes:
            count += 1
            cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, subject, theme, score, total_questions, time_taken_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                           (f'qs-{count}', 'quiz_start', f'sess-{count}', s, t, None, None, None))
    print(f"  [PASS] Inserted {count} valid subject-theme quiz_start combinations successfully.")

    # Quiz complete edge cases
    cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, subject, theme, score, total_questions, time_taken_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   ('qc-zero', 'quiz_complete', 'sess-1', 'Math for Eco', 'Theme 1', 0, 25, 0))
    cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, subject, theme, score, total_questions, time_taken_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   ('qc-max', 'quiz_complete', 'sess-1', 'Math for Eco', 'Theme 1', 25, 25, 3600))
    cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, subject, theme, score, total_questions, time_taken_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                   ('qc-mid', 'quiz_complete', 'sess-1', 'Quantitative Methods', 'Theme 5', 18, 25, 140))
    print("  [PASS] Inserted boundary quiz_complete events (0 score, perfect score, zero time) successfully.")

    # 2. Adversarial Invalid Event Types
    print("[2/5] Adversarially challenging event_type check constraints...")
    invalid_event_types = ['hack', '', 'click', 'PAGE_VISIT', 'quiz_abandon', 'random', 'null_event', '   ']
    for bad_et in invalid_event_types:
        try:
            cursor.execute("INSERT INTO site_analytics (id, event_type, session_id) VALUES (?, ?, ?)",
                           (f'bad-{bad_et}', bad_et, 'sess-x'))
            print(f"[FAIL]: Invalid event_type '{bad_et}' was accepted!")
            sys.exit(1)
        except sqlite3.IntegrityError:
            pass  # Expected constraint violation
    
    # Test NULL event_type
    try:
        cursor.execute("INSERT INTO site_analytics (id, event_type, session_id) VALUES (?, ?, ?)",
                       ('bad-null-et', None, 'sess-x'))
        print("[FAIL]: NULL event_type was accepted!")
        sys.exit(1)
    except sqlite3.IntegrityError:
        pass
    print(f"  [PASS] All {len(invalid_event_types) + 1} invalid event_types correctly rejected with IntegrityError.")

    # 3. Adversarially challenging negative score and time
    print("[3/5] Adversarially challenging numeric constraints (score, total, time)...")
    invalid_scores = [-1, -5, -25, -999]
    for bad_score in invalid_scores:
        try:
            cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, score) VALUES (?, ?, ?, ?)",
                           (f'bad-score-{bad_score}', 'quiz_complete', 'sess-x', bad_score))
            print(f"[FAIL]: Negative score {bad_score} was accepted!")
            sys.exit(1)
        except sqlite3.IntegrityError:
            pass
    print(f"  [PASS] All {len(invalid_scores)} negative score cases correctly rejected.")

    invalid_totals = [0, -1, -5, -25]
    for bad_total in invalid_totals:
        try:
            cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, total_questions) VALUES (?, ?, ?, ?)",
                           (f'bad-total-{bad_total}', 'quiz_complete', 'sess-x', bad_total))
            print(f"[FAIL]: Invalid total_questions {bad_total} was accepted!")
            sys.exit(1)
        except sqlite3.IntegrityError:
            pass
    print(f"  [PASS] All {len(invalid_totals)} invalid total_questions (<= 0) correctly rejected.")

    invalid_times = [-1, -5, -100]
    for bad_time in invalid_times:
        try:
            cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, time_taken_seconds) VALUES (?, ?, ?, ?)",
                           (f'bad-time-{bad_time}', 'quiz_complete', 'sess-x', bad_time))
            print(f"[FAIL]: Negative time {bad_time} was accepted!")
            sys.exit(1)
        except sqlite3.IntegrityError:
            pass
    print(f"  [PASS] All {len(invalid_times)} negative time_taken_seconds correctly rejected.")

    # 4. Adversarially challenging subject and theme checks
    print("[4/5] Adversarially challenging subject and theme check constraints...")
    invalid_subjects = [
        'Hacking 101', '', 'math for eco', 'Quantitative methods', 'ECONOMICS',
        'Intro to Business', 'Nonexistent Subject', 'Drop Table site_analytics;'
    ]
    for bad_sub in invalid_subjects:
        try:
            cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, subject) VALUES (?, ?, ?, ?)",
                           (f'bad-sub-{bad_sub}', 'quiz_start', 'sess-x', bad_sub))
            print(f"[FAIL]: Invalid subject '{bad_sub}' was accepted!")
            sys.exit(1)
        except sqlite3.IntegrityError:
            pass
    print(f"  [PASS] All {len(invalid_subjects)} invalid subjects correctly rejected.")

    invalid_themes = [
        'Theme 0', 'Theme 13', 'Theme 14', 'theme 1', 'THEME 2', 'Theme', '', 'Theme 99'
    ]
    for bad_thm in invalid_themes:
        try:
            cursor.execute("INSERT INTO site_analytics (id, event_type, session_id, theme) VALUES (?, ?, ?, ?)",
                           (f'bad-thm-{bad_thm}', 'quiz_start', 'sess-x', bad_thm))
            print(f"[FAIL]: Invalid theme '{bad_thm}' was accepted!")
            sys.exit(1)
        except sqlite3.IntegrityError:
            pass
    print(f"  [PASS] All {len(invalid_themes)} invalid themes correctly rejected.")

    # 5. Missing mandatory session_id
    print("[5/5] Adversarially challenging session_id NOT NULL constraint...")
    try:
        cursor.execute("INSERT INTO site_analytics (id, event_type, session_id) VALUES (?, ?, ?)",
                       ('bad-session', 'page_visit', None))
        print("[FAIL]: NULL session_id was accepted!")
        sys.exit(1)
    except sqlite3.IntegrityError:
        pass
    print("  [PASS] NULL session_id correctly rejected.")

    print("\n" + "=" * 60)
    print("ALL EMPIRICAL ADVERSARIAL STRESS TESTS PASSED (100% REJECTION OF INVALID INPUTS)")
    print("=" * 60)

if __name__ == '__main__':
    main()

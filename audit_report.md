# MongoDB Atlas & Analytics Audit Report (2026-07-18T16:40:10.350306 UTC)

## Connection Details
- Connection URI: mongodb+srv://inderashaiworkspace_db_user:fPZJ6C3DeezVr4n4@cluster0.fw4opds.mongodb.net/
- Database: ai_next_gen

## Component: Performance Analytics
- Collection `test_attempts`: ✅ Sample document found (fields: _id, test_id, candidate_id, status, started_at, completed_at, time_remaining, current_question_index, answers, violations, violation_count, tab_switch_count, is_locked, locked_reason, ip_address, created_at, questions, scores, selected, time_taken, disqualification_reason, disqualified_at, focus_change_count, idle_timeout_count, resize_count, security_score, suspicious_activity_count, suspicious_keyboard_count, window_blur_count)

## Component: Security Analytics
- Collection `security_logs`: ✅ Sample document found (fields: _id, test_id, candidate_id, event_type, detail, ip_address, user_agent, timestamp, violation_type, browser_details, session_details, time_remaining)

## Component: Admin Dashboard
- Collection `candidates`: ✅ Sample document found (fields: _id, id, candidate_id, session_id, name, college, department, year, email, phone, password_hash, linkedin, github, verified, started, completed, level1_ans, level2_ans, level3_ans, level4_ans, level5_ans, level6_ans, level7_ans, time_taken, tab_switches, violation_count, violation_logs, backspace_count, typing_speed_avg, typing_pattern_variance, mouse_moves_count, idle_duration, webcam_status, location_data, score_logic, score_creativity, score_ai_knowledge, score_problem_solving, score_research, score_ai_potential, score_workshop_compat, score_selection_prob, score_time, score_final, badges, selected, created_at, last_login, avatar, completed_at)
- Collection `test_assignments`: ✅ Sample document found (fields: _id, test_id, candidate_id, status, started_at, completed_at, time_remaining, current_question_index, answers, violations, violation_count, tab_switch_count, is_locked, locked_reason, ip_address, created_at, disqualification_reason, disqualified_at, focus_change_count, idle_timeout_count, resize_count, scores, security_score, suspicious_activity_count, suspicious_keyboard_count, window_blur_count)
- Collection `ai_evaluations`: ✅ Sample document found (fields: _id, candidate_id, logic_score, creativity_score, innovation_score, critical_thinking_score, problem_solving_score, human_intelligence_score, security_score, final_recommendation)

## Component: Student Dashboard
- Collection `candidates`: ✅ Sample document found (fields: _id, id, candidate_id, session_id, name, college, department, year, email, phone, password_hash, linkedin, github, verified, started, completed, level1_ans, level2_ans, level3_ans, level4_ans, level5_ans, level6_ans, level7_ans, time_taken, tab_switches, violation_count, violation_logs, backspace_count, typing_speed_avg, typing_pattern_variance, mouse_moves_count, idle_duration, webcam_status, location_data, score_logic, score_creativity, score_ai_knowledge, score_problem_solving, score_research, score_ai_potential, score_workshop_compat, score_selection_prob, score_time, score_final, badges, selected, created_at, last_login, avatar, completed_at)
- Collection `test_assignments`: ✅ Sample document found (fields: _id, test_id, candidate_id, status, started_at, completed_at, time_remaining, current_question_index, answers, violations, violation_count, tab_switch_count, is_locked, locked_reason, ip_address, created_at, disqualification_reason, disqualified_at, focus_change_count, idle_timeout_count, resize_count, scores, security_score, suspicious_activity_count, suspicious_keyboard_count, window_blur_count)

## Component: Result Page
- Collection `final_results`: ✅ Sample document found (fields: _id, candidate_id, final_score, ai_recommendation, admin_recommendation, final_selection_status)
- Collection `scores`: ✅ Sample document found (fields: _id, candidate_id, logic_score, creativity_score, innovation_score, problem_solving_score, security_score, ai_intelligence_score, final_score)

## Component: Candidate Report
- Collection `candidates`: ✅ Sample document found (fields: _id, id, candidate_id, session_id, name, college, department, year, email, phone, password_hash, linkedin, github, verified, started, completed, level1_ans, level2_ans, level3_ans, level4_ans, level5_ans, level6_ans, level7_ans, time_taken, tab_switches, violation_count, violation_logs, backspace_count, typing_speed_avg, typing_pattern_variance, mouse_moves_count, idle_duration, webcam_status, location_data, score_logic, score_creativity, score_ai_knowledge, score_problem_solving, score_research, score_ai_potential, score_workshop_compat, score_selection_prob, score_time, score_final, badges, selected, created_at, last_login, avatar, completed_at)
- Collection `answers`: ✅ Sample document found (fields: _id, candidate_id, question_id, answer, submitted_time, time_taken, marks_obtained)
- Collection `scores`: ✅ Sample document found (fields: _id, candidate_id, logic_score, creativity_score, innovation_score, problem_solving_score, security_score, ai_intelligence_score, final_score)

## Component: Shortlisting Page
- Collection `admin_shortlist`: ❌ Issue – None
- Collection `candidates`: ✅ Sample document found (fields: _id, id, candidate_id, session_id, name, college, department, year, email, phone, password_hash, linkedin, github, verified, started, completed, level1_ans, level2_ans, level3_ans, level4_ans, level5_ans, level6_ans, level7_ans, time_taken, tab_switches, violation_count, violation_logs, backspace_count, typing_speed_avg, typing_pattern_variance, mouse_moves_count, idle_duration, webcam_status, location_data, score_logic, score_creativity, score_ai_knowledge, score_problem_solving, score_research, score_ai_potential, score_workshop_compat, score_selection_prob, score_time, score_final, badges, selected, created_at, last_login, avatar, completed_at)

## Component: AI Evaluation Reports
- Collection `ai_evaluations`: ✅ Sample document found (fields: _id, candidate_id, logic_score, creativity_score, innovation_score, critical_thinking_score, problem_solving_score, human_intelligence_score, security_score, final_recommendation)

## Component: Test Portal
- Collection `test_assignments`: ✅ Sample document found (fields: _id, test_id, candidate_id, status, started_at, completed_at, time_remaining, current_question_index, answers, violations, violation_count, tab_switch_count, is_locked, locked_reason, ip_address, created_at, disqualification_reason, disqualified_at, focus_change_count, idle_timeout_count, resize_count, scores, security_score, suspicious_activity_count, suspicious_keyboard_count, window_blur_count)
- Collection `question_bank`: ✅ Sample document found (fields: _id, id, title, description, category, difficulty_level, correct_answer, explanation, marks, time_limit, question_type, options, is_active, created_at)
- Collection `security_logs`: ✅ Sample document found (fields: _id, test_id, candidate_id, event_type, detail, ip_address, user_agent, timestamp, violation_type, browser_details, session_details, time_remaining)

## Component: Security Monitoring
- Collection `security_logs`: ✅ Sample document found (fields: _id, test_id, candidate_id, event_type, detail, ip_address, user_agent, timestamp, violation_type, browser_details, session_details, time_remaining)

## Component: Question Bank Statistics
- Collection `question_bank`: ✅ Sample document found (fields: _id, id, title, description, category, difficulty_level, correct_answer, explanation, marks, time_limit, question_type, options, is_active, created_at)

## Component: Registration Statistics
- Collection `candidates`: ✅ Sample document found (fields: _id, id, candidate_id, session_id, name, college, department, year, email, phone, password_hash, linkedin, github, verified, started, completed, level1_ans, level2_ans, level3_ans, level4_ans, level5_ans, level6_ans, level7_ans, time_taken, tab_switches, violation_count, violation_logs, backspace_count, typing_speed_avg, typing_pattern_variance, mouse_moves_count, idle_duration, webcam_status, location_data, score_logic, score_creativity, score_ai_knowledge, score_problem_solving, score_research, score_ai_potential, score_workshop_compat, score_selection_prob, score_time, score_final, badges, selected, created_at, last_login, avatar, completed_at)

## Component: Test Statistics
- Collection `test_attempts`: ✅ Sample document found (fields: _id, test_id, candidate_id, status, started_at, completed_at, time_remaining, current_question_index, answers, violations, violation_count, tab_switch_count, is_locked, locked_reason, ip_address, created_at, disqualification_reason, disqualified_at, focus_change_count, idle_timeout_count, resize_count, scores, security_score, suspicious_activity_count, suspicious_keyboard_count, window_blur_count)
- Collection `tests`: ✅ Sample document found (fields: _id, name, description, duration_minutes, difficulty, status, created_at, updated_at, questions)

## Placeholder Issues Detected in Templates
- `signup.html` contains placeholder `John Doe`

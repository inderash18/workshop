from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
import json
import uuid


class User:
    def __init__(self, id, username, password_hash, email, role='admin', name=None):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.email = email
        self.role = role
        self.name = name or username
        self.created_at = datetime.utcnow()
        self.last_login = None

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'name': self.name,
            'created_at': self.created_at.isoformat(),
            'last_login': self.last_login.isoformat() if self.last_login else None
        }


class Candidate:
    def __init__(self, id, candidate_id, name, email, college, department, phone, year):
        self.id = id
        self.candidate_id = candidate_id
        self.name = name
        self.email = email
        self.college = college
        self.department = department
        self.phone = phone
        self.year = year
        self.status = 'registered'
        self.registered_at = datetime.utcnow()
        self.last_attempt_at = None
        self.attempts = 0
        self.completed = False

    def to_dict(self):
        return {
            'id': self.id,
            'candidate_id': self.candidate_id,
            'name': self.name,
            'email': self.email,
            'college': self.college,
            'department': self.department,
            'phone': self.phone,
            'year': self.year,
            'status': self.status,
            'registered_at': self.registered_at.isoformat(),
            'last_attempt_at': self.last_attempt_at.isoformat() if self.last_attempt_at else None,
            'attempts': self.attempts,
            'completed': self.completed
        }


class TestAssignment:
    def __init__(self, id, test_id, candidate_id, status='assigned'):
        self.id = id
        self.test_id = test_id
        self.candidate_id = candidate_id
        self.status = status
        self.started_at = None
        self.completed_at = None
        self.current_question_index = 0
        self.total_questions = 15
        self.questions_attempted = 0
        self.answers_correct = 0
        self.answers = {}
        self.answers_encrypted = {}
        self.time_per_question = {}
        self.violation_count = 0
        self.tab_switch_count = 0
        self.security_logs = []
        self.is_locked = False
        self.locked_reason = None
        self.scores = {}
        self.ai_scores = {}
        self.security_score = 0.0
        self.completion_time = 0
        self.question_response_times = {}
        self.ip_address = None
        self.user_agent = None
        self.device_info = {}
        self.student_id = None
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def to_dict(self):
        return {
            'id': self.id,
            'test_id': self.test_id,
            'candidate_id': self.candidate_id,
            'status': self.status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'current_question_index': self.current_question_index,
            'total_questions': self.total_questions,
            'questions_attempted': self.questions_attempted,
            'answers_correct': self.answers_correct,
            'violation_count': self.violation_count,
            'tab_switch_count': self.tab_switch_count,
            'is_locked': self.is_locked,
            'locked_reason': self.locked_reason,
            'scores': self.scores,
            'ai_scores': self.ai_scores,
            'security_score': self.security_score,
            'completion_time': self.completion_time,
            'time_per_question': self.time_per_question,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class QuestionBank:
    def __init__(self, id, question_text, category, difficulty_level, puzzle_type,
                 scenario_context, clues, path_to_solution, answer_json,
                 answer_explanation, human_thinking_required=True, ai_weakness="",
                 requires_humans_only=True, pattern_complexity=0):
        self.id = id
        self.question_text = question_text
        self.category = category
        self.difficulty_level = difficulty_level
        self.puzzle_type = puzzle_type
        self.scenario_context = scenario_context
        self.clues = clues
        self.path_to_solution = path_to_solution
        self.answer_json = answer_json
        self.answer_explanation = answer_explanation
        self.human_thinking_required = human_thinking_required
        self.ai_weakness = ai_weakness
        self.requires_humans_only = requires_humans_only
        self.pattern_complexity = pattern_complexity
        self.time_budget_seconds = 60
        self.difficulty_rating = self._calculate_difficulty()
        self.created_at = datetime.utcnow()
        self.is_active = True

    def _calculate_difficulty(self):
        difficulty_map = {
            'easy': 3.0,
            'medium': 5.0,
            'hard': 7.0,
            'expert': 9.0
        }
        return difficulty_map.get(self.difficulty_level, 5.0)

    def to_dict(self):
        return {
            'id': self.id,
            'question_text': self.question_text,
            'category': self.category,
            'difficulty_level': self.difficulty_level,
            'puzzle_type': self.puzzle_type,
            'scenario_context': self.scenario_context,
            'clues': self.clues,
            'path_to_solution': self.path_to_solution,
            'answer_json': self.answer_json,
            'answer_explanation': self.answer_explanation,
            'human_thinking_required': self.human_thinking_required,
            'ai_weakness': self.ai_weakness,
            'requires_humans_only': self.requires_humans_only,
            'pattern_complexity': self.pattern_complexity,
            'time_budget_seconds': self.time_budget_seconds,
            'difficulty_rating': self.difficulty_rating,
            'created_at': self.created_at.isoformat(),
            'is_active': self.is_active
        }


class SecurityEvent:
    def __init__(self, id, test_id, candidate_id, violation_type, severity_level=1,
                 event_data=None, action_taken='logged', consequence=None,
                 is_disqualified=False, question_number=None,
                 time_remaining=0, ip_address=None, user_agent=None):
        self.id = id
        self.test_id = test_id
        self.candidate_id = candidate_id
        self.violation_type = violation_type
        self.severity_level = severity_level
        self.event_data = event_data or {}
        self.action_taken = action_taken
        self.consequence = consequence
        self.is_disqualified = is_disqualified
        self.question_number = question_number
        self.time_remaining = time_remaining
        self.ip_address = ip_address
        self.user_agent = user_agent
        self.timestamp = datetime.utcnow()
        self.processed = False
        self.processed_at = None

    def to_dict(self):
        return {
            'id': self.id,
            'test_id': self.test_id,
            'candidate_id': self.candidate_id,
            'violation_type': self.violation_type,
            'severity_level': self.severity_level,
            'event_data': self.event_data,
            'action_taken': self.action_taken,
            'consequence': self.consequence,
            'is_disqualified': self.is_disqualified,
            'question_number': self.question_number,
            'time_remaining': self.time_remaining,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'timestamp': self.timestamp.isoformat(),
            'processed': self.processed,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None
        }


class AIEvaluation:
    def __init__(self, id, candidate_id, test_id, assignment_id=None):
        self.id = id
        self.candidate_id = candidate_id
        self.test_id = test_id
        self.assignment_id = assignment_id
        self.ai_intelligence_score = 0.0
        self.creativity_score = 0.0
        self.innovation_score = 0.0
        self.logic_score = 0.0
        self.problem_solving_score = 0.0
        self.security_score = 0.0
        self.response_patterns = {}
        self.analytical_depth = {}
        self.solution_quality = {}
        self.pattern_recognition = {}
        self.creative_approach = {}
        self.processing_time_seconds = 0.0
        self.ai_model_used = 'ensemble'
        self.confidence_score = 0.0
        self.evaluation_reasoning = ''
        self.ai_suggestions = {}
        self.strengths_identified = []
        self.improvement_areas = []
        self.timestamp = datetime.utcnow()
        self.is_processed = False

    def to_dict(self):
        return {
            'id': self.id,
            'candidate_id': self.candidate_id,
            'test_id': self.test_id,
            'assignment_id': self.assignment_id,
            'ai_intelligence_score': self.ai_intelligence_score,
            'creativity_score': self.creativity_score,
            'innovation_score': self.innovation_score,
            'logic_score': self.logic_score,
            'problem_solving_score': self.problem_solving_score,
            'security_score': self.security_score,
            'confidence_score': self.confidence_score,
            'strengths_identified': self.strengths_identified,
            'improvement_areas': self.improvement_areas,
            'timestamp': self.timestamp.isoformat(),
            'is_processed': self.is_processed
        }


class AdminShortlist:
    def __init__(self, id, test_id, candidate_id, action_type='shortlist',
                 admin_comments=None, admin_id=None, manual_criteria_scores=None,
                 admin_notes=None, final_status='pending'):
        self.id = id
        self.test_id = test_id
        self.candidate_id = candidate_id
        self.action_type = action_type
        self.admin_comments = admin_comments
        self.admin_id = admin_id
        self.manual_criteria_scores = manual_criteria_scores or {}
        self.admin_notes = admin_notes
        self.final_status = final_status
        self.approved_at = None
        self.timestamp = datetime.utcnow()

    def to_dict(self):
        return {
            'id': self.id,
            'test_id': self.test_id,
            'candidate_id': self.candidate_id,
            'action_type': self.action_type,
            'admin_comments': self.admin_comments,
            'admin_id': self.admin_id,
            'manual_criteria_scores': self.manual_criteria_scores,
            'admin_notes': self.admin_notes,
            'final_status': self.final_status,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'timestamp': self.timestamp.isoformat()
        }


class FinalResult:
    def __init__(self, id, candidate_id, final_score, ai_recommendation,
                 admin_recommendation, final_selection_status):
        self.id = id
        self.candidate_id = candidate_id
        self.final_score = final_score
        self.ai_recommendation = ai_recommendation
        self.admin_recommendation = admin_recommendation
        self.final_selection_status = final_selection_status
        self.evaluated_at = datetime.utcnow()

    def to_dict(self):
        return {
            'id': self.id,
            'candidate_id': self.candidate_id,
            'final_score': self.final_score,
            'ai_recommendation': self.ai_recommendation,
            'admin_recommendation': self.admin_recommendation,
            'final_selection_status': self.final_selection_status,
            'evaluated_at': self.evaluated_at.isoformat()
        }


class TestConfiguration:
    def __init__(self, key, value):
        self.key = key
        self.value = value

    def to_dict(self):
        return {
            'key': self.key,
            'value': self.value
        }


class Session:
    def __init__(self, id, session_id, candidate_id, test_id, status='active'):
        self.id = id
        self.session_id = session_id
        self.candidate_id = candidate_id
        self.test_id = test_id
        self.status = status
        self.created_at = datetime.utcnow()
        self.last_activity = datetime.utcnow()
        self.ip_address = None
        self.user_agent = None
        self.device_info = {}

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'candidate_id': self.candidate_id,
            'test_id': self.test_id,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'last_activity': self.last_activity.isoformat(),
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'device_info': self.device_info
        }


class ActivityLog:
    def __init__(self, id, action, user=None, details=None, ip=None, entity_type=None,
                 entity_id=None):
        self.id = id
        self.timestamp = datetime.utcnow()
        self.action = action
        self.user = user
        self.details = details or {}
        self.ip = ip
        self.entity_type = entity_type
        self.entity_id = entity_id

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'action': action,
            'user': user,
            'details': details,
            'ip': ip,
            'entity_type': entity_type,
            'entity_id': entity_id
        }


class Answer:
    def __init__(self, id, candidate_id, question_id, answer, submitted_time,
                 time_taken, marks_obtained):
        self.id = id
        self.candidate_id = candidate_id
        self.question_id = question_id
        self.answer = answer
        self.submitted_time = submitted_time
        self.time_taken = time_taken
        self.marks_obtained = marks_obtained

    def to_dict(self):
        return {
            'id': self.id,
            'candidate_id': self.candidate_id,
            'question_id': self.question_id,
            'answer': answer,
            'submitted_time': submitted_time.isoformat(),
            'time_taken': time_taken,
            'marks_obtained': marks_obtained
        }


class Score:
    def __init__(self, id, candidate_id, logic_score=0.0, creativity_score=0.0,
                 innovation_score=0.0, problem_solving_score=0.0,
                 security_score=0.0, ai_intelligence_score=0.0, final_score=0.0):
        self.id = id
        self.candidate_id = candidate_id
        self.logic_score = logic_score
        self.creativity_score = creativity_score
        self.innovation_score = innovation_score
        self.problem_solving_score = problem_solving_score
        self.security_score = security_score
        self.ai_intelligence_score = ai_intelligence_score
        self.final_score = final_score
        self.evaluated_at = datetime.utcnow()

    def to_dict(self):
        return {
            'id': self.id,
            'candidate_id': self.candidate_id,
            'logic_score': self.logic_score,
            'creativity_score': self.creativity_score,
            'innovation_score': self.innovation_score,
            'problem_solving_score': self.problem_solving_score,
            'security_score': self.security_score,
            'ai_intelligence_score': self.ai_intelligence_score,
            'final_score': self.final_score,
            'evaluated_at': self.evaluated_at.isoformat()
        }


class Analytics:
    def __init__(self, id, metric_type, metric_value, date, additional_data=None):
        self.id = id
        self.metric_type = metric_type
        self.metric_value = metric_value
        self.date = date
        self.additional_data = additional_data or {}

    def to_dict(self):
        return {
            'id': self.id,
            'metric_type': metric_type,
            'metric_value': metric_value,
            'date': date,
            'additional_data': additional_data
        }
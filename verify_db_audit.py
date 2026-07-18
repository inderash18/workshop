# verify_db_audit.py
"""
Database Connection and Analytics Audit Script

This script checks that each major component of the AI Selection Challenge platform
properly connects to MongoDB Atlas, queries the expected collections, and returns
sample data to validate that dynamic data is being used.
"""
import sys
import traceback
from datetime import datetime

# Import the DB helper
try:
    from models.database import _col, load_db, Config
except Exception as e:
    print(f"[Audit] Failed to import DB module: {e}")
    sys.exit(1)

# Helper to safely fetch a sample document
def sample_doc(collection_name, query=None):
    try:
        col = _col(collection_name)
        doc = col.find_one(query or {})
        return doc
    except Exception as e:
        return f"Error: {e}"

# Define the components and expected collections/queries
components = {
    "Performance Analytics": {
        "collections": ["test_attempts"],
        "sample_query": {"status": "completed"},
    },
    "Security Analytics": {"collections": ["security_logs"], "sample_query": {}},
    "Admin Dashboard": {"collections": ["candidates", "test_assignments", "ai_evaluations"], "sample_query": {}},
    "Student Dashboard": {"collections": ["candidates", "test_assignments"], "sample_query": {}},
    "Result Page": {"collections": ["final_results", "scores"], "sample_query": {}},
    "Candidate Report": {"collections": ["candidates", "answers", "scores"], "sample_query": {}},
    "Shortlisting Page": {"collections": ["admin_shortlist", "candidates"], "sample_query": {}},
    "AI Evaluation Reports": {"collections": ["ai_evaluations"], "sample_query": {}},
    "Test Portal": {"collections": ["test_assignments", "question_bank", "security_logs"], "sample_query": {}},
    "Security Monitoring": {"collections": ["security_logs"], "sample_query": {}},
    "Question Bank Statistics": {"collections": ["question_bank"], "sample_query": {}},
    "Registration Statistics": {"collections": ["candidates"], "sample_query": {}},
    "Test Statistics": {"collections": ["test_attempts", "tests"], "sample_query": {}},
}

print("[Audit] Starting MongoDB Atlas connection check...")
try:
    # Force connection attempt (will fallback if Atlas unreachable)
    db = load_db()
    print("[Audit] DB connection successful (Atlas or fallback). Using DB name:", Config.MONGODB_DB)
except Exception as e:
    print(f"[Audit] DB connection failed: {e}")
    sys.exit(1)

report_lines = []
report_lines.append(f"# MongoDB Atlas & Analytics Audit Report ({datetime.utcnow().isoformat()} UTC)")
report_lines.append("\n## Connection Details")
report_lines.append(f"- Connection URI: {Config.MONGODB_URI}\n- Database: {Config.MONGODB_DB}\n")

for comp, meta in components.items():
    report_lines.append(f"## Component: {comp}")
    for col_name in meta["collections"]:
        doc = sample_doc(col_name, meta.get("sample_query"))
        if isinstance(doc, dict):
            report_lines.append(f"- Collection `{col_name}`: ✅ Sample document found (fields: {', '.join(doc.keys())})")
        else:
            report_lines.append(f"- Collection `{col_name}`: ❌ Issue – {doc}")
    report_lines.append("")

# Simple heuristic for placeholder values in templates
import os, re
placeholder_patterns = [r"John Doe", r"example@example.com", r"12345"]
template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
placeholder_issues = []
for root, _, files in os.walk(template_dir):
    for f in files:
        if f.endswith('.html'):
            path = os.path.join(root, f)
            try:
                with open(path, 'r', encoding='utf-8') as fh:
                    content = fh.read()
                for pat in placeholder_patterns:
                    if re.search(pat, content):
                        placeholder_issues.append((f, pat))
            except Exception:
                continue
if placeholder_issues:
    report_lines.append("## Placeholder Issues Detected in Templates")
    for file, pat in placeholder_issues:
        report_lines.append(f"- `{file}` contains placeholder `{pat}`")
    report_lines.append("")
else:
    report_lines.append("## Placeholder Issues\n- No obvious placeholder values detected in templates.\n")

# Write report
report_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit_report.md")
with open(report_path, "w", encoding="utf-8") as out:
    out.write("\n".join(report_lines))
print(f"[Audit] Report generated at {report_path}")

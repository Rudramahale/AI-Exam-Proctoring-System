import os
from fpdf import FPDF
from datetime import datetime


def generate_pdf_report(session_data: dict, output_dir: str = None) -> str:
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "reports")
    os.makedirs(output_dir, exist_ok=True)
    session_id = session_data["session_id"]
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "AI Exam Proctoring Report", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(10)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, f"Session ID: {session_id}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, f"Student Name: {session_data.get('student_name', 'N/A')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f"Student ID: {session_data.get('student_id', 'N/A')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f"Email: {session_data.get('email', 'N/A')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f"Start Time: {session_data.get('start_time', 'N/A')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f"End Time: {session_data.get('end_time', 'N/A')}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, f"Score: {session_data.get('score', 'N/A')}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Violations:", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    violations = session_data.get("violations", [])
    if violations:
        for v in violations:
            pdf.cell(0, 6, f"  {v.get('timestamp', '')} - {v.get('name', '')} (Risk: {v.get('risk_weight', 0)})", new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.cell(0, 6, "  No violations recorded.", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    pdf.cell(0, 7, f"Final Risk Score: {session_data.get('risk_score', 0)}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Activity Log:", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    logs = session_data.get("activity_logs", [])
    if logs:
        for log in logs:
            pdf.cell(0, 6, f"  {log.get('timestamp', '')} - {log.get('activity', '')}", new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.cell(0, 6, "  No activity logs.", new_x="LMARGIN", new_y="NEXT")

    filepath = os.path.join(output_dir, f"{session_id}_report.pdf")
    pdf.output(filepath)
    return filepath

def get_risk_level(risk_score: float) -> str:
    if risk_score <= 30:
        return "LOW"
    elif risk_score <= 70:
        return "MEDIUM"
    else:
        return "HIGH"

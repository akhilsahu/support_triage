from typing import Dict
from app.yullo.services.home.repository import HomeSnapshot

def build_right_now(snapshot: HomeSnapshot) -> Dict[str, int]:
    """
    Computes global Right Now metrics (currently active sessions, total today).
    """
    active_now = sum(s.active_now_count for s in snapshot.session_metrics.values())
    today_count = sum(s.today_count for s in snapshot.session_metrics.values())
    
    return {
        "activeNow": active_now,
        "todayCount": today_count
    }

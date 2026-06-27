"""Empathy Engine - Sentiment Analysis Service"""

from dataclasses import dataclass
from typing import List
import structlog

logger = structlog.get_logger()


@dataclass
class EmpathyScore:
    """Sentiment scoring structure"""
    score: float  # 0.0 (angry) to 1.0 (happy)
    emotion: str  # angry, frustrated, neutral, satisfied, happy
    urgency: str  # low, medium, high, critical
    key_phrases: List[str]
    confidence: float


class EmpathyEngine:
    """
    Empathy Engine for sentiment analysis
    
    Design Principles:
    1. Sentiment score is the primary routing signal
    2. Low scores (< 0.3) trigger proactive compensation
    3. Scores are logged for continuous improvement
    """
    
    def __init__(self):
        self.sentiment_threshold = 0.3  # Below this = angry
        logger.info("EmpathyEngine initialized")
    
    async def analyze_sentiment(self, message: str) -> EmpathyScore:
        """
        Analyze sentiment of a message
        
        Returns a score from 0.0 (very angry) to 1.0 (very happy)
        
        For now, this is a simple keyword-based implementation.
        In production, this would use Claude 3.5 for nuanced analysis.
        """
        
        message_lower = message.lower()
        
        # Keyword-based sentiment analysis
        angry_keywords = ['angry', 'frustrated', 'furious', 'terrible', 'worst', 'hate', 'awful', 'horrible']
        negative_keywords = ['disappointed', 'unhappy', 'problem', 'issue', 'delayed', 'late', 'wrong']
        neutral_keywords = ['question', 'inquiry', 'wondering', 'asking', 'help']
        positive_keywords = ['thank', 'great', 'excellent', 'happy', 'satisfied', 'good', 'appreciate']
        
        # Count keyword matches
        angry_count = sum(1 for word in angry_keywords if word in message_lower)
        negative_count = sum(1 for word in negative_keywords if word in message_lower)
        neutral_count = sum(1 for word in neutral_keywords if word in message_lower)
        positive_count = sum(1 for word in positive_keywords if word in message_lower)
        
        # Calculate sentiment score
        if angry_count > 0:
            score = 0.2
            emotion = "angry"
            urgency = "critical"
        elif negative_count > 0:
            score = 0.4
            emotion = "frustrated"
            urgency = "high"
        elif positive_count > 0:
            score = 0.8
            emotion = "satisfied"
            urgency = "low"
        else:
            score = 0.6
            emotion = "neutral"
            urgency = "medium"
        
        # Extract key phrases (simplified)
        key_phrases = []
        for word in angry_keywords + negative_keywords + positive_keywords:
            if word in message_lower:
                key_phrases.append(word)
        
        empathy_score = EmpathyScore(
            score=score,
            emotion=emotion,
            urgency=urgency,
            key_phrases=key_phrases[:5],  # Limit to 5
            confidence=0.75  # Mock confidence
        )
        
        logger.info("Sentiment analyzed",
                   score=empathy_score.score,
                   emotion=empathy_score.emotion,
                   urgency=empathy_score.urgency)
        
        return empathy_score
    
    def should_trigger_proactive_compensation(
        self,
        sentiment_score: float
    ) -> bool:
        """
        Proactive compensation trigger
        
        Returns True if customer is angry enough to warrant
        immediate compensation without waiting for request
        """
        return sentiment_score < self.sentiment_threshold

# Made with Bob

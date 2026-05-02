"""
Empathy Engine - Sentiment Scoring Logic

This module implements the Empathy Engine that analyzes customer sentiment
and triggers special handling for low sentiment scores.

Key Features:
- Sentiment analysis with scoring (0.0 - 1.0)
- Logic gate at threshold 0.4
- Bypass standard FAQs for low sentiment
- Direct routing to Finance Agent for proactive compensation
- Multi-factor sentiment analysis
"""

from typing import Dict, Any, Optional, List
from enum import Enum
import re
import json
from dataclasses import dataclass

import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger()


class SentimentLevel(str, Enum):
    """Sentiment level enumeration"""
    VERY_NEGATIVE = "very_negative"  # 0.0 - 0.2
    NEGATIVE = "negative"            # 0.2 - 0.4
    NEUTRAL = "neutral"              # 0.4 - 0.6
    POSITIVE = "positive"            # 0.6 - 0.8
    VERY_POSITIVE = "very_positive"  # 0.8 - 1.0


class UrgencyLevel(str, Enum):
    """Urgency level enumeration"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class SentimentAnalysis:
    """Sentiment analysis result"""
    score: float  # 0.0 (very negative) to 1.0 (very positive)
    level: SentimentLevel
    urgency: UrgencyLevel
    factors: Dict[str, float]  # Individual factor scores
    triggers: List[str]  # Triggered keywords/patterns
    empathy_triggered: bool  # Whether empathy protocol activated
    confidence: float  # Confidence in the analysis


class EmpathyEngine:
    """
    Empathy Engine for sentiment analysis and special handling.
    
    Analyzes customer messages for sentiment and urgency, triggering
    special handling (bypass FAQs, direct to Finance) when sentiment
    score falls below 0.4.
    """
    
    # Empathy threshold - below this triggers special handling
    EMPATHY_THRESHOLD = 0.4
    
    # Negative sentiment indicators
    NEGATIVE_KEYWORDS = {
        "angry": -0.3,
        "furious": -0.4,
        "outraged": -0.4,
        "disgusted": -0.3,
        "terrible": -0.2,
        "horrible": -0.2,
        "awful": -0.2,
        "worst": -0.2,
        "hate": -0.3,
        "disappointed": -0.2,
        "frustrated": -0.2,
        "annoyed": -0.15,
        "upset": -0.2,
        "unacceptable": -0.25,
        "ridiculous": -0.2,
        "pathetic": -0.3,
        "useless": -0.25,
        "waste": -0.2,
        "scam": -0.4,
        "fraud": -0.4,
        "lie": -0.3,
        "lying": -0.3,
        "never": -0.15,
        "always": -0.1,  # In negative context
    }
    
    # Positive sentiment indicators
    POSITIVE_KEYWORDS = {
        "great": 0.2,
        "excellent": 0.3,
        "amazing": 0.3,
        "wonderful": 0.3,
        "fantastic": 0.3,
        "love": 0.3,
        "happy": 0.2,
        "satisfied": 0.2,
        "pleased": 0.2,
        "thank": 0.15,
        "thanks": 0.15,
        "appreciate": 0.2,
        "helpful": 0.2,
        "perfect": 0.25,
        "good": 0.15,
    }
    
    # Urgency indicators
    URGENCY_KEYWORDS = {
        "urgent": 0.3,
        "emergency": 0.4,
        "immediately": 0.3,
        "asap": 0.3,
        "now": 0.2,
        "today": 0.2,
        "right now": 0.3,
        "critical": 0.4,
        "important": 0.2,
        "need": 0.15,
        "must": 0.2,
        "have to": 0.15,
    }
    
    # Profanity indicators (strong negative)
    PROFANITY_PATTERNS = [
        r'\b(damn|dammit|hell|crap|shit|fuck|fucking|wtf|bs|bullshit)\b',
    ]
    
    def __init__(self):
        """Initialize the Empathy Engine"""
        self.analysis_count = 0
        self.empathy_trigger_count = 0
        # Lazy import to avoid circular deps at module load
        self._llm_service = None

    def _get_llm(self):
        if self._llm_service is None:
            from app.services.llm_service import llm_service
            self._llm_service = llm_service
        return self._llm_service

    async def analyze(self, text: str) -> SentimentAnalysis:
        """
        Analyze sentiment of customer message.
        
        Args:
            text: The customer message to analyze
            
        Returns:
            SentimentAnalysis with score, level, and triggers
        """
        self.analysis_count += 1

        # Try LLM-based analysis first
        llm_result = await self._analyze_with_llm(text)
        if llm_result:
            if llm_result.empathy_triggered:
                self.empathy_trigger_count += 1
            return llm_result

        # Fallback to keyword analysis
        logger.warning("LLM empathy analysis unavailable — using keyword fallback")
        return self._analyze_with_keywords(text)

    async def _analyze_with_llm(self, text: str) -> Optional[SentimentAnalysis]:
        """Use LLM to analyze sentiment. Returns None if LLM is unavailable."""
        system_prompt = """You are a sentiment analysis engine for a customer support system.
Analyze the customer message and return a JSON object with exactly these fields:
- score: float 0.0 (very angry/negative) to 1.0 (very happy/positive)
- level: one of "very_negative", "negative", "neutral", "positive", "very_positive"
- urgency: one of "low", "medium", "high", "critical"
- triggers: list of strings describing what signals you detected (e.g. "profanity", "frustration", "urgency")
- confidence: float 0.0 to 1.0

Return only valid JSON, no explanation."""

        try:
            result = await self._get_llm().generate_with_fallback(
                messages=[{"role": "user", "content": f"Analyze this customer message: {text}"}],
                system_prompt=system_prompt,
                temperature=0.1,
                max_tokens=200,
            )
            if not result:
                return None

            data = json.loads(result["content"])
            score = float(data["score"])
            empathy_triggered = score < self.EMPATHY_THRESHOLD

            logger.info("LLM empathy analysis", score=score, level=data["level"],
                       urgency=data["urgency"], provider=result.get("provider"))

            return SentimentAnalysis(
                score=round(score, 3),
                level=SentimentLevel(data["level"]),
                urgency=UrgencyLevel(data["urgency"]),
                factors={"llm": score},
                triggers=data.get("triggers", []),
                empathy_triggered=empathy_triggered,
                confidence=round(float(data.get("confidence", 0.9)), 3),
            )
        except Exception as e:
            logger.warning(f"LLM empathy parse error: {e} — falling back to keywords")
            return None

    def _analyze_with_keywords(self, text: str) -> SentimentAnalysis:
        """Keyword-based fallback sentiment analysis."""
        text_lower = text.lower()

        factors = {
            "keywords": self._analyze_keywords(text_lower),
            "urgency": self._analyze_urgency(text_lower),
            "profanity": self._analyze_profanity(text_lower),
            "caps_lock": self._analyze_caps_lock(text),
            "exclamation": self._analyze_exclamation(text),
            "length": self._analyze_length(text),
        }

        score = 0.5
        score += factors["keywords"]
        score -= factors["urgency"] * 0.3
        score -= factors["profanity"] * 0.5
        score -= factors["caps_lock"] * 0.2
        score -= factors["exclamation"] * 0.1
        score = max(0.0, min(1.0, score))

        level = self._get_sentiment_level(score)
        urgency = self._get_urgency_level(factors["urgency"])
        triggers = self._get_triggers(text_lower)
        empathy_triggered = score < self.EMPATHY_THRESHOLD

        if empathy_triggered:
            self.empathy_trigger_count += 1

        confidence = self._calculate_confidence(text, factors)

        return SentimentAnalysis(
            score=round(score, 3),
            level=level,
            urgency=urgency,
            factors=factors,
            triggers=triggers,
            empathy_triggered=empathy_triggered,
            confidence=round(confidence, 3),
        )
    
    def _analyze_keywords(self, text: str) -> float:
        """
        Analyze sentiment keywords.
        
        Args:
            text: Lowercase text
            
        Returns:
            Sentiment adjustment (-1.0 to 1.0)
        """
        sentiment = 0.0
        
        # Check negative keywords
        for keyword, weight in self.NEGATIVE_KEYWORDS.items():
            if keyword in text:
                sentiment += weight
        
        # Check positive keywords
        for keyword, weight in self.POSITIVE_KEYWORDS.items():
            if keyword in text:
                sentiment += weight
        
        # Clamp to reasonable range
        return max(-0.5, min(0.5, sentiment))
    
    def _analyze_urgency(self, text: str) -> float:
        """
        Analyze urgency indicators.
        
        Args:
            text: Lowercase text
            
        Returns:
            Urgency score (0.0 to 1.0)
        """
        urgency = 0.0
        
        for keyword, weight in self.URGENCY_KEYWORDS.items():
            if keyword in text:
                urgency += weight
        
        return min(1.0, urgency)
    
    def _analyze_profanity(self, text: str) -> float:
        """
        Analyze profanity usage.
        
        Args:
            text: Lowercase text
            
        Returns:
            Profanity score (0.0 to 1.0)
        """
        profanity_count = 0
        
        for pattern in self.PROFANITY_PATTERNS:
            matches = re.findall(pattern, text, re.IGNORECASE)
            profanity_count += len(matches)
        
        # Each profanity adds 0.3, capped at 1.0
        return min(1.0, profanity_count * 0.3)
    
    def _analyze_caps_lock(self, text: str) -> float:
        """
        Analyze excessive caps lock usage.
        
        Args:
            text: Original text
            
        Returns:
            Caps lock score (0.0 to 1.0)
        """
        if len(text) < 10:
            return 0.0
        
        # Count uppercase letters
        upper_count = sum(1 for c in text if c.isupper())
        total_letters = sum(1 for c in text if c.isalpha())
        
        if total_letters == 0:
            return 0.0
        
        # If more than 50% uppercase, it's shouting
        caps_ratio = upper_count / total_letters
        
        if caps_ratio > 0.5:
            return min(1.0, caps_ratio)
        
        return 0.0
    
    def _analyze_exclamation(self, text: str) -> float:
        """
        Analyze excessive exclamation marks.
        
        Args:
            text: Original text
            
        Returns:
            Exclamation score (0.0 to 1.0)
        """
        exclamation_count = text.count('!')
        
        # More than 2 exclamation marks indicates strong emotion
        if exclamation_count > 2:
            return min(1.0, exclamation_count * 0.2)
        
        return 0.0
    
    def _analyze_length(self, text: str) -> float:
        """
        Analyze message length (very short or very long can indicate issues).
        
        Args:
            text: Original text
            
        Returns:
            Length factor (0.0 to 1.0)
        """
        word_count = len(text.split())
        
        # Very short messages (< 5 words) might be curt/angry
        if word_count < 5:
            return 0.3
        
        # Very long messages (> 100 words) might indicate frustration
        if word_count > 100:
            return 0.2
        
        return 0.0
    
    def _get_sentiment_level(self, score: float) -> SentimentLevel:
        """
        Convert sentiment score to level.
        
        Args:
            score: Sentiment score (0.0 - 1.0)
            
        Returns:
            SentimentLevel
        """
        if score < 0.2:
            return SentimentLevel.VERY_NEGATIVE
        elif score < 0.4:
            return SentimentLevel.NEGATIVE
        elif score < 0.6:
            return SentimentLevel.NEUTRAL
        elif score < 0.8:
            return SentimentLevel.POSITIVE
        else:
            return SentimentLevel.VERY_POSITIVE
    
    def _get_urgency_level(self, urgency_score: float) -> UrgencyLevel:
        """
        Convert urgency score to level.
        
        Args:
            urgency_score: Urgency score (0.0 - 1.0)
            
        Returns:
            UrgencyLevel
        """
        if urgency_score < 0.2:
            return UrgencyLevel.LOW
        elif urgency_score < 0.4:
            return UrgencyLevel.MEDIUM
        elif urgency_score < 0.7:
            return UrgencyLevel.HIGH
        else:
            return UrgencyLevel.CRITICAL
    
    def _get_triggers(self, text: str) -> List[str]:
        """
        Get list of triggered keywords.
        
        Args:
            text: Lowercase text
            
        Returns:
            List of triggered keywords
        """
        triggers = []
        
        # Check negative keywords
        for keyword in self.NEGATIVE_KEYWORDS:
            if keyword in text:
                triggers.append(f"negative:{keyword}")
        
        # Check urgency keywords
        for keyword in self.URGENCY_KEYWORDS:
            if keyword in text:
                triggers.append(f"urgency:{keyword}")
        
        # Check profanity
        for pattern in self.PROFANITY_PATTERNS:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                triggers.append(f"profanity:{match}")
        
        return triggers
    
    def _calculate_confidence(
        self,
        text: str,
        factors: Dict[str, float]
    ) -> float:
        """
        Calculate confidence in the sentiment analysis.
        
        Args:
            text: Original text
            factors: Factor scores
            
        Returns:
            Confidence score (0.0 - 1.0)
        """
        confidence = 0.5  # Start at medium confidence
        
        # More text = higher confidence
        word_count = len(text.split())
        if word_count > 20:
            confidence += 0.2
        elif word_count < 5:
            confidence -= 0.2
        
        # Clear indicators = higher confidence
        if factors["profanity"] > 0 or factors["caps_lock"] > 0:
            confidence += 0.2
        
        # Multiple factors = higher confidence
        active_factors = sum(1 for v in factors.values() if abs(v) > 0.1)
        confidence += active_factors * 0.05
        
        return max(0.0, min(1.0, confidence))
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get empathy engine statistics.
        
        Returns:
            Dictionary with statistics
        """
        empathy_trigger_rate = 0.0
        if self.analysis_count > 0:
            empathy_trigger_rate = self.empathy_trigger_count / self.analysis_count
        
        return {
            "total_analyses": self.analysis_count,
            "empathy_triggers": self.empathy_trigger_count,
            "empathy_trigger_rate": round(empathy_trigger_rate, 3),
            "threshold": self.EMPATHY_THRESHOLD
        }


# Global empathy engine instance
_empathy_engine: Optional[EmpathyEngine] = None


def get_empathy_engine() -> EmpathyEngine:
    """
    Get the global empathy engine instance.
    
    Returns:
        The empathy engine
    """
    global _empathy_engine
    if _empathy_engine is None:
        _empathy_engine = EmpathyEngine()
    return _empathy_engine

# Made with Bob

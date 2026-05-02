"""LLM Service with switchable models (watsonx.ai, OpenAI, Anthropic)"""

from typing import Optional, Dict, Any, List
from enum import Enum
import structlog
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic

from app.config import settings

logger = structlog.get_logger()


class LLMProvider(str, Enum):
    """Supported LLM providers"""
    WATSONX = "watsonx"
    ANTHROPIC = "anthropic"
    OPENAI = "openai"


class LLMModel(str, Enum):
    """Supported LLM models"""
    # IBM watsonx.ai Models
    GRANITE_13B_CHAT = "ibm/granite-13b-chat-v2"
    GRANITE_20B = "ibm/granite-20b-multilingual"
    LLAMA_70B = "meta-llama/llama-3-70b-instruct"

    # OpenAI Models
    GPT_35_TURBO = "gpt-3.5-turbo"
    GPT_4 = "gpt-4"
    GPT_4_TURBO = "gpt-4-turbo-preview"
    GPT_4O = "gpt-4o"
    GPT_4O_MINI = "gpt-4o-mini"

    # Anthropic Models
    CLAUDE_3_OPUS = "claude-3-opus-20240229"
    CLAUDE_3_SONNET = "claude-3-sonnet-20240229"
    CLAUDE_3_HAIKU = "claude-3-haiku-20240307"
    CLAUDE_35_SONNET = "claude-3-5-sonnet-20240620"


class LLMService:
    """
    Unified LLM service supporting multiple providers and models.
    
    Supports:
    - OpenAI: GPT-3.5-turbo, GPT-4, GPT-4-turbo, GPT-4o
    - Anthropic: Claude 3 (Opus, Sonnet, Haiku), Claude 3.5
    """
    
    def __init__(self):
        self.openai_client: Optional[AsyncOpenAI] = None
        self.anthropic_client: Optional[AsyncAnthropic] = None
        self.watsonx_client = None
        self._initialize_clients()

    def _initialize_clients(self):
        """Initialize API clients"""
        # watsonx.ai — top priority
        if settings.WATSONX_API_KEY and settings.WATSONX_API_KEY != "your-watsonx-api-key-here":
            try:
                from ibm_watsonx_ai import APIClient, Credentials
                credentials = Credentials(
                    url=settings.WATSONX_URL,
                    api_key=settings.WATSONX_API_KEY,
                )
                self.watsonx_client = APIClient(credentials)
                logger.info("watsonx.ai client initialized", model=settings.WATSONX_MODEL)
            except Exception as e:
                logger.warning(f"watsonx.ai init failed: {e}")
        else:
            logger.warning("watsonx.ai unavailable — WATSONX_API_KEY not set")

        if settings.ANTHROPIC_API_KEY and not settings.ANTHROPIC_API_KEY.startswith("sk-ant-your"):
            self.anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            logger.info("Anthropic client initialized")
        else:
            logger.warning("Anthropic unavailable — ANTHROPIC_API_KEY not set")

        if settings.OPENAI_API_KEY:
            self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            logger.info("OpenAI client initialized")
        else:
            logger.warning("OpenAI unavailable — OPENAI_API_KEY not set")

    def _get_provider_from_model(self, model: str) -> LLMProvider:
        """Determine provider from model name"""
        if model.startswith("gpt"):
            return LLMProvider.OPENAI
        elif model.startswith("claude"):
            return LLMProvider.ANTHROPIC
        elif model.startswith("ibm/") or model.startswith("meta-llama/"):
            return LLMProvider.WATSONX
        else:
            raise ValueError(f"Unknown model: {model}")
    
    async def generate(
        self,
        messages: List[Dict[str, str]],
        model: str = None,
        temperature: float = None,
        max_tokens: int = None,
        system_prompt: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate completion using specified model.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model name (e.g., 'gpt-4', 'claude-3-opus-20240229')
            temperature: Sampling temperature (0-2 for OpenAI, 0-1 for Claude)
            max_tokens: Maximum tokens to generate
            system_prompt: System prompt (optional)
            **kwargs: Additional provider-specific parameters
        
        Returns:
            Dict with 'content', 'model', 'usage', and 'provider'
        """
        model = model or settings.OPENAI_MODEL
        temperature = temperature if temperature is not None else settings.OPENAI_TEMPERATURE
        max_tokens = max_tokens or settings.OPENAI_MAX_TOKENS
        
        provider = self._get_provider_from_model(model)
        
        logger.info(
            "Generating completion",
            model=model,
            provider=provider.value,
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        if provider == LLMProvider.WATSONX:
            return await self._generate_watsonx(
                messages, model, temperature, max_tokens, system_prompt, **kwargs
            )
        elif provider == LLMProvider.OPENAI:
            return await self._generate_openai(
                messages, model, temperature, max_tokens, system_prompt, **kwargs
            )
        elif provider == LLMProvider.ANTHROPIC:
            return await self._generate_anthropic(
                messages, model, temperature, max_tokens, system_prompt, **kwargs
            )
        else:
            raise ValueError(f"Unsupported provider: {provider}")
    
    async def _generate_watsonx(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        system_prompt: Optional[str],
        **kwargs
    ) -> Dict[str, Any]:
        """Generate completion using IBM watsonx.ai"""
        if not self.watsonx_client:
            raise ValueError("watsonx.ai client not initialized. Check WATSONX_API_KEY.")

        from ibm_watsonx_ai.foundation_models import ModelInference
        from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

        # Build prompt from messages
        prompt_parts = []
        if system_prompt:
            prompt_parts.append(f"System: {system_prompt}\n")
        for msg in messages:
            role = msg.get("role", "user").capitalize()
            prompt_parts.append(f"{role}: {msg['content']}")
        prompt_parts.append("Assistant:")
        prompt = "\n".join(prompt_parts)

        params = {
            GenParams.MAX_NEW_TOKENS: max_tokens,
            GenParams.TEMPERATURE: temperature,
            GenParams.STOP_SEQUENCES: ["\nUser:", "\nHuman:"],
        }

        try:
            inference_kwargs = {
                "model_id": model,
                "params": params,
                "credentials": self.watsonx_client.credentials,
            }
            if settings.WATSONX_PROJECT_ID:
                inference_kwargs["project_id"] = settings.WATSONX_PROJECT_ID
            elif settings.WATSONX_SPACE_ID:
                inference_kwargs["space_id"] = settings.WATSONX_SPACE_ID

            model_inference = ModelInference(**inference_kwargs)
            response = model_inference.generate_text(prompt=prompt)

            return {
                "content": response.strip(),
                "model": model,
                "provider": LLMProvider.WATSONX.value,
                "usage": {},
                "finish_reason": "stop",
            }
        except Exception as e:
            logger.error(f"watsonx.ai generation failed: {e}")
            raise

    async def _generate_openai(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        system_prompt: Optional[str],
        **kwargs
    ) -> Dict[str, Any]:
        """Generate completion using OpenAI"""
        if not self.openai_client:
            raise ValueError("OpenAI client not initialized. Check OPENAI_API_KEY.")
        
        # Add system prompt if provided
        if system_prompt:
            messages = [{"role": "system", "content": system_prompt}] + messages
        
        try:
            response = await self.openai_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )
            
            return {
                "content": response.choices[0].message.content,
                "model": response.model,
                "provider": LLMProvider.OPENAI.value,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                },
                "finish_reason": response.choices[0].finish_reason,
            }
        except Exception as e:
            logger.error(f"OpenAI generation failed: {e}")
            raise
    
    async def _generate_anthropic(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        system_prompt: Optional[str],
        **kwargs
    ) -> Dict[str, Any]:
        """Generate completion using Anthropic Claude"""
        if not self.anthropic_client:
            raise ValueError("Anthropic client not initialized. Check ANTHROPIC_API_KEY.")
        
        # Claude expects system prompt separately
        system = system_prompt or "You are a helpful AI assistant."
        
        # Filter out system messages from messages list
        filtered_messages = [
            msg for msg in messages 
            if msg.get("role") != "system"
        ]
        
        try:
            response = await self.anthropic_client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=filtered_messages,
                **kwargs
            )
            
            return {
                "content": response.content[0].text,
                "model": response.model,
                "provider": LLMProvider.ANTHROPIC.value,
                "usage": {
                    "prompt_tokens": response.usage.input_tokens,
                    "completion_tokens": response.usage.output_tokens,
                    "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
                },
                "finish_reason": response.stop_reason,
            }
        except Exception as e:
            logger.error(f"Anthropic generation failed: {e}")
            raise
    
    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: str = None,
        temperature: float = None,
        max_tokens: int = None,
        system_prompt: Optional[str] = None,
        **kwargs
    ):
        """
        Generate streaming completion.
        
        Yields chunks of generated text.
        """
        model = model or settings.OPENAI_MODEL
        temperature = temperature if temperature is not None else settings.OPENAI_TEMPERATURE
        max_tokens = max_tokens or settings.OPENAI_MAX_TOKENS
        
        provider = self._get_provider_from_model(model)
        
        if provider == LLMProvider.OPENAI:
            async for chunk in self._generate_openai_stream(
                messages, model, temperature, max_tokens, system_prompt, **kwargs
            ):
                yield chunk
        elif provider == LLMProvider.ANTHROPIC:
            async for chunk in self._generate_anthropic_stream(
                messages, model, temperature, max_tokens, system_prompt, **kwargs
            ):
                yield chunk
    
    async def _generate_openai_stream(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        system_prompt: Optional[str],
        **kwargs
    ):
        """Generate streaming completion using OpenAI"""
        if not self.openai_client:
            raise ValueError("OpenAI client not initialized.")
        
        if system_prompt:
            messages = [{"role": "system", "content": system_prompt}] + messages
        
        try:
            stream = await self.openai_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
                **kwargs
            )
            
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield {
                        "content": chunk.choices[0].delta.content,
                        "model": model,
                        "provider": LLMProvider.OPENAI.value,
                    }
        except Exception as e:
            logger.error(f"OpenAI streaming failed: {e}")
            raise
    
    async def _generate_anthropic_stream(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        system_prompt: Optional[str],
        **kwargs
    ):
        """Generate streaming completion using Anthropic"""
        if not self.anthropic_client:
            raise ValueError("Anthropic client not initialized.")
        
        system = system_prompt or "You are a helpful AI assistant."
        filtered_messages = [
            msg for msg in messages 
            if msg.get("role") != "system"
        ]
        
        try:
            async with self.anthropic_client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=filtered_messages,
                **kwargs
            ) as stream:
                async for text in stream.text_stream:
                    yield {
                        "content": text,
                        "model": model,
                        "provider": LLMProvider.ANTHROPIC.value,
                    }
        except Exception as e:
            logger.error(f"Anthropic streaming failed: {e}")
            raise
    
    async def generate_with_fallback(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 500,
    ) -> Optional[Dict[str, Any]]:
        """
        Try Anthropic first, fall back to OpenAI, log if both unavailable.

        Returns the LLM response dict on success, or None if all providers fail.
        """
        providers = []

        if self.watsonx_client:
            providers.append(("watsonx", settings.WATSONX_MODEL))
        else:
            logger.warning("watsonx.ai unavailable — skipping")

        if self.anthropic_client:
            providers.append(("anthropic", LLMModel.CLAUDE_35_SONNET.value))
        else:
            logger.warning("Anthropic unavailable — skipping")

        if self.openai_client:
            providers.append(("openai", LLMModel.GPT_4O_MINI.value))
        else:
            logger.warning("OpenAI unavailable — skipping")

        if not providers:
            logger.error("No LLM providers available — falling back to keyword responses")
            return None

        for provider_name, model in providers:
            try:
                logger.info(f"Trying LLM provider: {provider_name} ({model})")
                result = await self.generate(
                    messages=messages,
                    model=model,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                logger.info(f"LLM response from {provider_name}", tokens=result.get("usage", {}).get("total_tokens"))
                return result
            except Exception as e:
                logger.warning(f"{provider_name} failed: {e} — trying next provider")

        logger.error("All LLM providers failed — falling back to keyword responses")
        return None

    def get_available_models(self) -> Dict[str, List[str]]:
        """Get list of available models by provider"""
        available = {}
        
        if self.openai_client:
            available[LLMProvider.OPENAI.value] = [
                LLMModel.GPT_35_TURBO.value,
                LLMModel.GPT_4.value,
                LLMModel.GPT_4_TURBO.value,
                LLMModel.GPT_4O.value,
                LLMModel.GPT_4O_MINI.value,
            ]
        
        if self.anthropic_client:
            available[LLMProvider.ANTHROPIC.value] = [
                LLMModel.CLAUDE_3_OPUS.value,
                LLMModel.CLAUDE_3_SONNET.value,
                LLMModel.CLAUDE_3_HAIKU.value,
                LLMModel.CLAUDE_35_SONNET.value,
            ]
        
        return available


# Global LLM service instance
llm_service = LLMService()

# Made with Bob
